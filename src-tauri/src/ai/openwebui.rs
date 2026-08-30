use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

use super::{AIProvider, AIResponse, ChatMessage, ChatRole, ToolCall, ToolDefinition};

/// A stalled OpenWebUI instance (or a route to nowhere) must not hang a
/// chat turn forever — the orchestrator can call `send` up to
/// `orchestrator::MAX_ITERATIONS` times per turn, and there's no
/// cancel button in the UI, so an unbounded request is an unbounded hang
/// with the only recovery being an app restart. 120s is generous for a
/// local model to actually finish generating, while still bounding the
/// worst case.
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(120);

/// Talks to a self-hosted OpenWebUI instance over its OpenAI-compatible
/// `/api/chat/completions` endpoint (bearer auth, `{model, messages, tools}`
/// request, `choices[0].message` response, optional native `tool_calls` —
/// support for the latter depends on which model OpenWebUI is pointed at,
/// so a response with no `tool_calls` is just treated as a normal message).
pub struct OpenWebUIProvider {
    base_url: String,
    api_key: String,
    model: String,
    timeout: Duration,
}

impl OpenWebUIProvider {
    pub fn new(base_url: String, api_key: String, model: String) -> Self {
        Self::with_timeout(base_url, api_key, model, DEFAULT_TIMEOUT)
    }

    /// Split out from `new` so tests can use a short timeout instead of
    /// waiting on the real (120s) default.
    fn with_timeout(base_url: String, api_key: String, model: String, timeout: Duration) -> Self {
        Self {
            base_url: base_url.trim_end_matches('/').to_string(),
            api_key,
            model,
            timeout,
        }
    }
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

        let response = ureq::post(&endpoint)
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
        let provider = OpenWebUIProvider::new(url, "test-key".into(), "sonnet-5".into());

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
        let provider = OpenWebUIProvider::new(format!("{url}/"), "key".into(), "model".into());

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
        let provider = OpenWebUIProvider::new(url, "key".into(), "model".into());
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
        let provider = OpenWebUIProvider::new(url, "key".into(), "model".into());
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
        let provider = OpenWebUIProvider::new(url, "key".into(), "model".into());

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
        let provider = OpenWebUIProvider::new(url, "bad-key".into(), "model".into());

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
        let provider = OpenWebUIProvider::with_timeout(
            url,
            "key".into(),
            "model".into(),
            std::time::Duration::from_millis(200),
        );

        let start = std::time::Instant::now();
        let err = provider.send(&[ChatMessage::user("hi")], &[]).unwrap_err();

        assert!(
            start.elapsed() < std::time::Duration::from_secs(5),
            "send should give up around the configured timeout, took {:?}",
            start.elapsed()
        );
        assert!(err.to_string().contains("OpenWebUI request failed"));
    }
}
