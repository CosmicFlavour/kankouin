use std::sync::Arc;
use std::time::Duration;

use rustls_pki_types::pem::PemObject;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

use super::{AIProvider, AIResponse, ChatMessage, ChatRole, ToolCall, ToolDefinition};

/// Talks to a self-hosted OpenWebUI instance over its OpenAI-compatible
/// `/api/chat/completions` endpoint (bearer auth, `{model, messages, tools}`
/// request, `choices[0].message` response, optional native `tool_calls` —
/// support for the latter depends on which model OpenWebUI is pointed at,
/// so a response with no `tool_calls` is just treated as a normal message).
///
/// `timeout` is caller-supplied (from `AIConnection::timeout_seconds`, user-
/// configurable in the settings UI) rather than a fixed constant — a
/// stalled OpenWebUI instance must not hang a chat turn forever, and the
/// orchestrator can call `send` up to `MAX_ITERATIONS` times per turn with
/// no cancel button in the UI, so what counts as "too long" needs to be
/// adjustable per deployment (a slow local model vs. a hung endpoint).
pub struct OpenWebUIProvider {
    base_url: String,
    api_key: String,
    model: String,
    timeout: Duration,
    /// All requests go through this one agent — it carries the TLS config
    /// (`build_agent`) built from the connection's optional CA certificate,
    /// which ureq only exposes at agent level.
    agent: ureq::Agent,
}

impl OpenWebUIProvider {
    pub fn new(
        base_url: String,
        api_key: String,
        model: String,
        timeout: Duration,
        ca_certificate_path: Option<String>,
    ) -> AppResult<Self> {
        Ok(Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            api_key,
            model,
            timeout,
            agent: build_agent(ca_certificate_path.as_deref())?,
        })
    }
}

/// Builds the `ureq::Agent` for a connection. With no custom CA configured
/// this is the stock agent (default webpki roots). Otherwise the certs from
/// the PEM file are added *on top of* those roots — never replacing them —
/// so publicly-signed endpoints keep verifying while an internal/corporate
/// cert (e.g. a company-issued one not in any public trust store) verifies
/// too. Fails with a readable error if the file can't be read/parsed, so a
/// typo'd path surfaces at connect time instead of as a bare TLS failure.
fn build_agent(ca_certificate_path: Option<&str>) -> AppResult<ureq::Agent> {
    let Some(path) = ca_certificate_path.map(str::trim).filter(|p| !p.is_empty()) else {
        return Ok(ureq::Agent::new());
    };

    // `pem_file_iter` accepts a bundle (multiple certs in one file), which
    // is what corporate "CA chain" files usually are.
    let iter = rustls_pki_types::CertificateDer::pem_file_iter(path).map_err(|e| {
        AppError::Invalid(format!("could not read CA certificate file '{path}': {e}"))
    })?;
    let mut extra_roots: Vec<rustls_pki_types::CertificateDer<'static>> = Vec::new();
    for cert in iter {
        extra_roots.push(
            cert.map_err(|e| AppError::Invalid(format!("invalid certificate in '{path}': {e}")))?,
        );
    }
    if extra_roots.is_empty() {
        return Err(AppError::Invalid(format!(
            "no PEM-encoded certificates found in '{path}'"
        )));
    }

    let mut root_store =
        ureq::rustls::RootCertStore::from_iter(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    for cert in extra_roots {
        root_store.add(cert).map_err(|e| {
            AppError::Invalid(format!(
                "could not add a certificate from '{path}' to the trust store: {e}"
            ))
        })?;
    }

    // Same shape as ureq's own default TLS config (see `ureq::rtls`): an
    // explicit ring provider rather than relying on a process-wide default
    // crypto provider having been installed.
    let config = ureq::rustls::ClientConfig::builder_with_provider(
        ureq::rustls::crypto::ring::default_provider().into(),
    )
    .with_protocol_versions(&[&ureq::rustls::version::TLS12, &ureq::rustls::version::TLS13])
    .map_err(|e| AppError::Invalid(format!("invalid TLS configuration: {e}")))?
    .with_root_certificates(root_store)
    .with_no_client_auth();

    Ok(ureq::AgentBuilder::new()
        .tls_config(Arc::new(config))
        .build())
}

#[derive(Serialize)]
struct WireRequest<'a> {
    model: &'a str,
    messages: Vec<WireMessage>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    tools: Vec<WireTool>,
    stream: bool,
}

#[derive(Serialize)]
struct WireMessage {
    role: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    tool_calls: Vec<WireToolCall>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
}

#[derive(Serialize)]
struct WireToolCall {
    id: String,
    #[serde(rename = "type")]
    kind: &'static str,
    function: WireFunctionCall,
}

#[derive(Serialize)]
struct WireFunctionCall {
    name: String,
    /// JSON-encoded per the OpenAI wire format — `ToolCall::arguments` is a
    /// `serde_json::Value` internally, but goes over the wire as a string.
    arguments: String,
}

#[derive(Serialize)]
struct WireTool {
    #[serde(rename = "type")]
    kind: &'static str,
    function: WireFunctionDef,
}

#[derive(Serialize)]
struct WireFunctionDef {
    name: String,
    description: String,
    parameters: serde_json::Value,
}

fn to_wire_message(msg: &ChatMessage) -> WireMessage {
    let role = match msg.role {
        ChatRole::User => "user",
        ChatRole::Assistant => "assistant",
        ChatRole::Tool => "tool",
        ChatRole::System => "system",
    };
    // An assistant message that *is* a tool-call request carries no text of
    // its own — sent as `null`, matching the OpenAI wire format, rather
    // than an empty string.
    let content = if msg.tool_calls.is_empty() {
        Some(msg.content.clone())
    } else {
        None
    };
    let tool_calls = msg
        .tool_calls
        .iter()
        .map(|tc| WireToolCall {
            id: tc.id.clone(),
            kind: "function",
            function: WireFunctionCall {
                name: tc.name.clone(),
                arguments: tc.arguments.to_string(),
            },
        })
        .collect();

    WireMessage {
        role,
        content,
        tool_calls,
        tool_call_id: msg.tool_call_id.clone(),
    }
}

fn to_wire_tool(tool: &ToolDefinition) -> WireTool {
    WireTool {
        kind: "function",
        function: WireFunctionDef {
            name: tool.name.clone(),
            description: tool.description.clone(),
            parameters: tool.parameters.clone(),
        },
    }
}

#[derive(Deserialize)]
struct WireResponse {
    choices: Vec<WireChoice>,
}

#[derive(Deserialize)]
struct WireChoice {
    message: WireResponseMessage,
}

#[derive(Deserialize)]
struct WireResponseMessage {
    #[serde(default)]
    content: Option<String>,
    #[serde(default)]
    tool_calls: Vec<WireResponseToolCall>,
}

#[derive(Deserialize)]
struct WireResponseToolCall {
    id: String,
    function: WireResponseFunctionCall,
}

#[derive(Deserialize)]
struct WireResponseFunctionCall {
    name: String,
    arguments: String,
}

fn parse_response(body: WireResponse) -> AppResult<AIResponse> {
    let message = body
        .choices
        .into_iter()
        .next()
        .ok_or_else(|| AppError::Invalid("OpenWebUI response had no choices".into()))?
        .message;

    if message.tool_calls.is_empty() {
        return Ok(AIResponse::Message(message.content.unwrap_or_default()));
    }

    let calls = message
        .tool_calls
        .into_iter()
        .map(|tc| {
            let arguments: serde_json::Value = serde_json::from_str(&tc.function.arguments)
                .map_err(|e| {
                    AppError::Invalid(format!("invalid tool_call arguments from OpenWebUI: {e}"))
                })?;
            Ok(ToolCall {
                id: tc.id,
                name: tc.function.name,
                arguments,
            })
        })
        .collect::<AppResult<Vec<_>>>()?;

    Ok(AIResponse::ToolCalls(calls))
}

impl AIProvider for OpenWebUIProvider {
    fn id(&self) -> &str {
        "openwebui"
    }

    fn send(&self, messages: &[ChatMessage], tools: &[ToolDefinition]) -> AppResult<AIResponse> {
        let endpoint = format!("{}/api/chat/completions", self.base_url);
        let request = WireRequest {
            model: self.model.as_str(),
            messages: messages.iter().map(to_wire_message).collect(),
            tools: tools.iter().map(to_wire_tool).collect(),
            stream: false,
        };

        let response = self
            .agent
            .post(&endpoint)
            .set("Authorization", &format!("Bearer {}", self.api_key))
            .set("Content-Type", "application/json")
            .timeout(self.timeout)
            .send_json(request)
            .map_err(|e| {
                AppError::Invalid(format!(
                    "OpenWebUI request failed: {}",
                    crate::cloud::describe_ureq_error(e)
                ))
            })?;

        let body: WireResponse = response
            .into_json()
            .map_err(|e| AppError::Invalid(format!("invalid OpenWebUI response: {e}")))?;

        parse_response(body)
    }
}

/// Result of probing a connection before it's saved — lets the settings UI
/// show something more useful than "it worked" or "it didn't": whether the
/// configured model is actually one OpenWebUI knows about.
#[derive(Debug, Clone, Serialize)]
pub struct ConnectionTestResult {
    pub model_found: bool,
    pub available_models: Vec<String>,
}

#[derive(Deserialize)]
struct ModelsResponse {
    #[serde(default)]
    data: Vec<ModelEntry>,
}

#[derive(Deserialize)]
struct ModelEntry {
    id: String,
}

/// Probes a connection's reachability/auth via OpenWebUI's `GET /api/models`
/// — cheap (no generation, no tokens spent) and, as a side effect, tells us
/// whether the given model name is actually one OpenWebUI has available,
/// which a bare "did the request succeed" check couldn't. Standalone rather
/// than a method on `OpenWebUIProvider`/part of `AIProvider`: it runs
/// against *draft*, not-yet-saved connection details from the settings
/// dialog, so there's no saved `AIConnection` (and thus no `AIProvider`) to
/// call it on yet.
pub fn test_connection(
    base_url: &str,
    api_key: &str,
    model: &str,
    timeout: Duration,
    ca_certificate_path: Option<&str>,
) -> AppResult<ConnectionTestResult> {
    let endpoint = format!("{}/api/models", base_url.trim_end_matches('/'));

    // Same custom-CA handling as `OpenWebUIProvider` — the test must go
    // through TLS exactly the way real requests will, or it would report a
    // connection that only works without the corporate CA.
    let agent = build_agent(ca_certificate_path)?;

    let response = agent
        .get(&endpoint)
        .set("Authorization", &format!("Bearer {api_key}"))
        .timeout(timeout)
        .call()
        .map_err(|e| {
            AppError::Invalid(format!(
                "OpenWebUI connection test failed: {}",
                crate::cloud::describe_ureq_error(e)
            ))
        })?;

    let body: ModelsResponse = response
        .into_json()
        .map_err(|e| AppError::Invalid(format!("invalid response from OpenWebUI: {e}")))?;

    let available_models: Vec<String> = body.data.into_iter().map(|m| m.id).collect();
    let model_found = available_models.iter().any(|m| m == model);

    Ok(ConnectionTestResult {
        model_found,
        available_models,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::io::{BufRead, BufReader, Read as _, Write};
    use std::net::TcpListener;
    use std::sync::mpsc;
    use std::thread;

    struct CapturedRequest {
        headers: Vec<(String, String)>,
        body: serde_json::Value,
    }

    /// Same throwaway-local-server test harness as `cloud::dropbox`'s tests
    /// — captures the single request it receives and replies with a canned
    /// response, so these tests don't hit the network.
    fn serve_and_capture(
        status_line: &'static str,
        response_body: &'static [u8],
    ) -> (String, mpsc::Receiver<CapturedRequest>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let (tx, rx) = mpsc::channel();

        thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut reader = BufReader::new(stream.try_clone().unwrap());

            let mut request_line = String::new();
            reader.read_line(&mut request_line).unwrap();

            let mut headers = Vec::new();
            let mut content_length = 0usize;
            loop {
                let mut line = String::new();
                reader.read_line(&mut line).unwrap();
                if line == "\r\n" || line.is_empty() {
                    break;
                }
                if let Some((name, value)) = line.trim_end().split_once(':') {
                    let name = name.trim().to_string();
                    let value = value.trim().to_string();
                    if name.eq_ignore_ascii_case("content-length") {
                        content_length = value.parse().unwrap_or(0);
                    }
                    headers.push((name, value));
                }
            }

            let mut raw_body = vec![0u8; content_length];
            if content_length > 0 {
                reader.read_exact(&mut raw_body).unwrap();
            }
            let body = serde_json::from_slice(&raw_body).unwrap_or(serde_json::Value::Null);
            tx.send(CapturedRequest { headers, body }).unwrap();

            let response_head = format!(
                "{status_line}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                response_body.len(),
            );
            stream.write_all(response_head.as_bytes()).unwrap();
            stream.write_all(response_body).unwrap();
        });

        (format!("http://{addr}"), rx)
    }

    fn header<'a>(captured: &'a CapturedRequest, name: &str) -> Option<&'a str> {
        captured
            .headers
            .iter()
            .find(|(n, _)| n.eq_ignore_ascii_case(name))
            .map(|(_, v)| v.as_str())
    }

    #[test]
    fn send_posts_model_messages_and_bearer_auth() {
        let (url, rx) = serve_and_capture(
            "HTTP/1.1 200 OK",
            br#"{"choices":[{"message":{"role":"assistant","content":"hi there"}}]}"#,
        );
        let provider = OpenWebUIProvider::new(
            url,
            "test-key".into(),
            "sonnet-5".into(),
            Duration::from_secs(5),
            None,
        )
        .unwrap();

        let reply = provider.send(&[ChatMessage::user("hello")], &[]).unwrap();

        assert!(matches!(reply, AIResponse::Message(text) if text == "hi there"));
        let captured = rx.recv().unwrap();
        assert_eq!(header(&captured, "Authorization"), Some("Bearer test-key"));
        assert_eq!(captured.body["model"], json!("sonnet-5"));
        assert_eq!(
            captured.body["messages"],
            json!([{ "role": "user", "content": "hello" }])
        );
        assert!(captured.body.get("tools").is_none());
    }

    #[test]
    fn new_trims_a_trailing_slash_from_base_url() {
        let (url, rx) = serve_and_capture(
            "HTTP/1.1 200 OK",
            br#"{"choices":[{"message":{"role":"assistant","content":"ok"}}]}"#,
        );
        let provider = OpenWebUIProvider::new(
            format!("{url}/"),
            "key".into(),
            "model".into(),
            Duration::from_secs(5),
            None,
        )
        .unwrap();

        provider.send(&[ChatMessage::user("hi")], &[]).unwrap();

        // No `//api/chat/completions` double slash — the mock server only
        // accepts one path, so a malformed URL would fail to connect/parse
        // rather than land here.
        rx.recv().unwrap();
    }

    #[test]
    fn send_includes_tool_definitions_as_openai_function_specs() {
        let (url, rx) = serve_and_capture(
            "HTTP/1.1 200 OK",
            br#"{"choices":[{"message":{"role":"assistant","content":"ok"}}]}"#,
        );
        let provider = OpenWebUIProvider::new(
            url,
            "key".into(),
            "model".into(),
            Duration::from_secs(5),
            None,
        )
        .unwrap();
        let tools = vec![ToolDefinition {
            name: "create_task".into(),
            description: "Creates a task".into(),
            parameters: json!({ "type": "object", "properties": {} }),
        }];

        provider.send(&[ChatMessage::user("hi")], &tools).unwrap();

        let captured = rx.recv().unwrap();
        assert_eq!(
            captured.body["tools"],
            json!([{
                "type": "function",
                "function": {
                    "name": "create_task",
                    "description": "Creates a task",
                    "parameters": { "type": "object", "properties": {} }
                }
            }])
        );
    }

    #[test]
    fn send_maps_a_tool_call_round_trip_to_wire_format() {
        let (url, rx) = serve_and_capture(
            "HTTP/1.1 200 OK",
            br#"{"choices":[{"message":{"role":"assistant","content":"done"}}]}"#,
        );
        let provider = OpenWebUIProvider::new(
            url,
            "key".into(),
            "model".into(),
            Duration::from_secs(5),
            None,
        )
        .unwrap();
        let messages = vec![
            ChatMessage::user("add a subtask"),
            ChatMessage::assistant_tool_calls(vec![ToolCall {
                id: "call-1".into(),
                name: "add_subtask".into(),
                arguments: json!({ "task_id": "t1", "title": "Step 1" }),
            }]),
            ChatMessage::tool_result("call-1", json!({ "ok": true }).to_string()),
        ];

        provider.send(&messages, &[]).unwrap();

        let captured = rx.recv().unwrap();
        let wire_messages = captured.body["messages"].as_array().unwrap();
        assert_eq!(wire_messages.len(), 3);
        assert_eq!(wire_messages[1]["role"], json!("assistant"));
        assert_eq!(wire_messages[1]["content"], json!(null));
        assert_eq!(
            wire_messages[1]["tool_calls"],
            json!([{
                "id": "call-1",
                "type": "function",
                "function": {
                    "name": "add_subtask",
                    "arguments": json!({ "task_id": "t1", "title": "Step 1" }).to_string()
                }
            }])
        );
        assert_eq!(wire_messages[2]["role"], json!("tool"));
        assert_eq!(wire_messages[2]["tool_call_id"], json!("call-1"));
        assert_eq!(wire_messages[2]["content"], json!("{\"ok\":true}"));
    }

    #[test]
    fn send_parses_tool_calls_from_the_response() {
        let (url, _rx) = serve_and_capture(
            "HTTP/1.1 200 OK",
            br#"{"choices":[{"message":{"role":"assistant","content":null,"tool_calls":[
                {"id":"call-9","function":{"name":"list_tasks","arguments":"{\"project_id\":\"p1\"}"}}
            ]}}]}"#,
        );
        let provider = OpenWebUIProvider::new(
            url,
            "key".into(),
            "model".into(),
            Duration::from_secs(5),
            None,
        )
        .unwrap();

        let reply = provider.send(&[ChatMessage::user("hi")], &[]).unwrap();

        match reply {
            AIResponse::ToolCalls(calls) => {
                assert_eq!(calls.len(), 1);
                assert_eq!(calls[0].id, "call-9");
                assert_eq!(calls[0].name, "list_tasks");
                assert_eq!(calls[0].arguments, json!({ "project_id": "p1" }));
            }
            AIResponse::Message(_) => panic!("expected tool calls"),
        }
    }

    #[test]
    fn send_surfaces_a_clean_error_on_failure_response() {
        let (url, _rx) = serve_and_capture(
            "HTTP/1.1 401 Unauthorized",
            br#"{"error":{"message":"invalid API key"}}"#,
        );
        let provider = OpenWebUIProvider::new(
            url,
            "bad-key".into(),
            "model".into(),
            Duration::from_secs(5),
            None,
        )
        .unwrap();

        let err = provider.send(&[ChatMessage::user("hi")], &[]).unwrap_err();

        let message = err.to_string();
        assert!(
            message.contains("invalid API key"),
            "error message should include OpenWebUI's response body, got: {message}"
        );
    }

    /// Accepts the connection but never writes a response — simulates a
    /// stalled OpenWebUI instance, which `send` must give up on instead of
    /// hanging forever.
    fn serve_and_hang() -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();

        thread::spawn(move || {
            // Held for the thread's lifetime so the connection stays open
            // (but silent) rather than being reset immediately.
            let _stream = listener.accept().unwrap();
            thread::sleep(std::time::Duration::from_secs(60));
        });

        format!("http://{addr}")
    }

    #[test]
    fn send_times_out_instead_of_hanging_forever_on_a_stalled_server() {
        let url = serve_and_hang();
        let provider = OpenWebUIProvider::new(
            url,
            "key".into(),
            "model".into(),
            std::time::Duration::from_millis(200),
            None,
        )
        .unwrap();

        let start = std::time::Instant::now();
        let err = provider.send(&[ChatMessage::user("hi")], &[]).unwrap_err();

        assert!(
            start.elapsed() < std::time::Duration::from_secs(5),
            "send should give up around the configured timeout, took {:?}",
            start.elapsed()
        );
        assert!(err.to_string().contains("OpenWebUI request failed"));
    }

    #[test]
    fn test_connection_reports_when_the_model_is_found() {
        let (url, rx) = serve_and_capture(
            "HTTP/1.1 200 OK",
            br#"{"data":[{"id":"sonnet-5"},{"id":"llama3.1:70b"}]}"#,
        );

        let result =
            test_connection(&url, "test-key", "sonnet-5", Duration::from_secs(5), None).unwrap();

        assert!(result.model_found);
        assert_eq!(result.available_models, vec!["sonnet-5", "llama3.1:70b"]);
        let captured = rx.recv().unwrap();
        assert_eq!(header(&captured, "Authorization"), Some("Bearer test-key"));
    }

    #[test]
    fn test_connection_reports_when_the_model_is_not_found() {
        let (url, _rx) =
            serve_and_capture("HTTP/1.1 200 OK", br#"{"data":[{"id":"llama3.1:70b"}]}"#);

        let result =
            test_connection(&url, "test-key", "sonnet-5", Duration::from_secs(5), None).unwrap();

        assert!(!result.model_found);
        assert_eq!(result.available_models, vec!["llama3.1:70b"]);
    }

    #[test]
    fn test_connection_surfaces_a_clean_error_on_bad_auth() {
        let (url, _rx) = serve_and_capture(
            "HTTP/1.1 401 Unauthorized",
            br#"{"error":{"message":"invalid API key"}}"#,
        );

        let err =
            test_connection(&url, "bad-key", "sonnet-5", Duration::from_secs(5), None).unwrap_err();

        assert!(err.to_string().contains("invalid API key"));
    }

    #[test]
    fn build_agent_without_a_ca_path_is_fine() {
        // No path: stock agent. Blank/whitespace-only path: treated as not
        // configured rather than attempted.
        assert!(build_agent(None).is_ok());
        assert!(build_agent(Some("   ")).is_ok());
    }

    #[test]
    fn build_agent_fails_cleanly_on_an_unreadable_ca_path() {
        let err = build_agent(Some("/nonexistent/corporate-ca.pem")).unwrap_err();

        assert!(err
            .to_string()
            .contains("could not read CA certificate file"));
    }

    #[test]
    fn build_agent_fails_when_the_file_holds_no_certificates() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("not-a-cert.pem");
        std::fs::write(&path, "this file has no PEM blocks\n").unwrap();

        let err = build_agent(Some(path.to_str().unwrap())).unwrap_err();

        assert!(err.to_string().contains("no PEM-encoded certificates"));
    }

    /// A throwaway CA and a server leaf cert signed by it, for the
    /// custom-CA TLS round-trip tests below — the thing none of the tests
    /// above actually exercise, since `serve_and_capture`/`serve_and_hang`
    /// are plain HTTP with no TLS involved at all.
    struct TestCa {
        ca_cert_pem: String,
        server_config: Arc<ureq::rustls::ServerConfig>,
    }

    fn generate_test_ca() -> TestCa {
        let ca_key = rcgen::KeyPair::generate().unwrap();
        let mut ca_params = rcgen::CertificateParams::new(Vec::<String>::new()).unwrap();
        ca_params.is_ca = rcgen::IsCa::Ca(rcgen::BasicConstraints::Unconstrained);
        let ca_cert = ca_params.self_signed(&ca_key).unwrap();

        // SAN must cover whatever host the client dials — the tests below
        // always connect to 127.0.0.1.
        let server_key = rcgen::KeyPair::generate().unwrap();
        let server_params = rcgen::CertificateParams::new(vec!["127.0.0.1".to_string()]).unwrap();
        let server_cert = server_params
            .signed_by(&server_key, &ca_cert, &ca_key)
            .unwrap();

        let server_config = ureq::rustls::ServerConfig::builder_with_provider(
            ureq::rustls::crypto::ring::default_provider().into(),
        )
        .with_safe_default_protocol_versions()
        .unwrap()
        .with_no_client_auth()
        .with_single_cert(
            vec![server_cert.der().clone()],
            rustls_pki_types::PrivateKeyDer::Pkcs8(server_key.serialize_der().into()),
        )
        .unwrap();

        TestCa {
            ca_cert_pem: ca_cert.pem(),
            server_config: Arc::new(server_config),
        }
    }

    /// Same request/response shape as `serve_and_capture`, but the socket is
    /// wrapped in a real TLS handshake using `server_config` — so a client
    /// that doesn't trust the cert this presents fails at the handshake,
    /// before any HTTP is exchanged at all.
    fn serve_tls_and_capture(
        server_config: Arc<ureq::rustls::ServerConfig>,
        status_line: &'static str,
        response_body: &'static [u8],
    ) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();

        thread::spawn(move || {
            let (sock, _) = listener.accept().unwrap();
            // Handshake failures (a client that rejects this cert) surface
            // as an `Err` from `ServerConnection::new`/the first read — in
            // that case there's nothing to serve, so just drop the thread.
            let Ok(conn) = ureq::rustls::ServerConnection::new(server_config) else {
                return;
            };
            let tls_stream = ureq::rustls::StreamOwned::new(conn, sock);
            let mut reader = BufReader::new(tls_stream);

            let mut request_line = String::new();
            if reader.read_line(&mut request_line).unwrap_or(0) == 0 {
                // Handshake never completed (client walked away after
                // rejecting the cert) — nothing more to do.
                return;
            }

            let mut content_length = 0usize;
            loop {
                let mut line = String::new();
                reader.read_line(&mut line).unwrap();
                if line == "\r\n" || line.is_empty() {
                    break;
                }
                if let Some((name, value)) = line.trim_end().split_once(':') {
                    if name.trim().eq_ignore_ascii_case("content-length") {
                        content_length = value.trim().parse().unwrap_or(0);
                    }
                }
            }
            if content_length > 0 {
                let mut body = vec![0u8; content_length];
                reader.read_exact(&mut body).unwrap();
            }

            let response_head = format!(
                "{status_line}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                response_body.len(),
            );
            let _ = reader.get_mut().write_all(response_head.as_bytes());
            let _ = reader.get_mut().write_all(response_body);
        });

        format!("https://{addr}")
    }

    #[test]
    fn send_succeeds_against_a_server_whose_cert_is_signed_by_the_configured_custom_ca() {
        let ca = generate_test_ca();
        let url = serve_tls_and_capture(
            ca.server_config,
            "HTTP/1.1 200 OK",
            br#"{"choices":[{"message":{"role":"assistant","content":"hi over tls"}}]}"#,
        );
        let cert_dir = tempfile::tempdir().unwrap();
        let cert_path = cert_dir.path().join("corporate-ca.pem");
        std::fs::write(&cert_path, &ca.ca_cert_pem).unwrap();

        let provider = OpenWebUIProvider::new(
            url,
            "test-key".into(),
            "model".into(),
            Duration::from_secs(5),
            Some(cert_path.to_str().unwrap().to_string()),
        )
        .unwrap();

        let reply = provider.send(&[ChatMessage::user("hello")], &[]).unwrap();

        assert!(matches!(reply, AIResponse::Message(text) if text == "hi over tls"));
    }

    #[test]
    fn send_fails_against_a_server_whose_cert_is_covered_by_neither_public_roots_nor_a_custom_ca() {
        let ca = generate_test_ca();
        let url = serve_tls_and_capture(
            ca.server_config,
            "HTTP/1.1 200 OK",
            br#"{"choices":[{"message":{"role":"assistant","content":"should never be read"}}]}"#,
        );
        // No `ca_certificate_path` — only the stock public roots, which
        // don't (and can't) cover a freshly generated test CA. This is the
        // control for the test above: it proves `build_agent` is actually
        // enforcing verification rather than, say, silently accepting any
        // server cert once TLS is wired up.
        let provider = OpenWebUIProvider::new(
            url,
            "test-key".into(),
            "model".into(),
            Duration::from_secs(5),
            None,
        )
        .unwrap();

        let err = provider
            .send(&[ChatMessage::user("hello")], &[])
            .unwrap_err();

        // Specifically a rejected-certificate failure (`UnknownIssuer`), not
        // just any transport error — proves the client actually verified
        // the cert against its trust store rather than, say, refusing to
        // connect for an unrelated reason.
        assert!(
            err.to_string().contains("UnknownIssuer"),
            "expected a certificate-verification error, got: {err}"
        );
    }
}
