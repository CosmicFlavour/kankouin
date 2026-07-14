use std::io::Read;

use crate::cloud::{describe_ureq_error, CloudProvider};
use crate::error::{AppError, AppResult};

/// Replace with the App key from https://www.dropbox.com/developers/apps
/// once you've registered an app there (Settings tab → App key). Not a
/// secret: Dropbox's PKCE flow for desktop/native apps doesn't use an app
/// secret, so this is fine to embed in source.
const CLIENT_ID: &str = "itwemlsvegmpv0o";

const UPLOAD_URL: &str = "https://content.dropboxapi.com/2/files/upload";
const DOWNLOAD_URL: &str = "https://content.dropboxapi.com/2/files/download";
const ACCOUNT_URL: &str = "https://api.dropboxapi.com/2/users/get_current_account";

/// Fixed path for the backup file. The app only requested the "App folder"
/// permission when registering with Dropbox, so this is scoped to
/// `Apps/Kankouin/` in the user's Dropbox automatically — no need to
/// remember a remote_ref the way a file-id-based provider like Drive would.
const BACKUP_PATH: &str = "/backup.enc";

pub struct Dropbox;

impl CloudProvider for Dropbox {
    fn id(&self) -> &'static str {
        "dropbox"
    }

    fn display_name(&self) -> &'static str {
        "Dropbox"
    }

    fn authorize_url(&self, state: &str, code_challenge: &str, redirect_uri: &str) -> String {
        format!(
            "https://www.dropbox.com/oauth2/authorize\
             ?client_id={client_id}\
             &response_type=code\
             &code_challenge={code_challenge}\
             &code_challenge_method=S256\
             &token_access_type=offline\
             &scope={scope}\
             &redirect_uri={redirect_uri}\
             &state={state}",
            client_id = CLIENT_ID,
            code_challenge = code_challenge,
            scope = urlencoding_encode(self.scopes()),
            redirect_uri = urlencoding_encode(redirect_uri),
            state = state,
        )
    }

    fn token_url(&self) -> &'static str {
        "https://api.dropboxapi.com/oauth2/token"
    }

    fn client_id(&self) -> &'static str {
        CLIENT_ID
    }

    fn scopes(&self) -> &'static str {
        "files.content.write files.content.read account_info.read"
    }

    fn upload(
        &self,
        access_token: &str,
        _remote_ref: Option<&str>,
        bytes: &[u8],
    ) -> AppResult<String> {
        upload_to(UPLOAD_URL, access_token, BACKUP_PATH, bytes)?;
        Ok(BACKUP_PATH.to_string())
    }

    fn download(&self, access_token: &str, remote_ref: &str) -> AppResult<Vec<u8>> {
        download_from(DOWNLOAD_URL, access_token, remote_ref)
    }

    fn account_label(&self, access_token: &str) -> AppResult<Option<String>> {
        fetch_account_label_from(ACCOUNT_URL, access_token)
    }
}

/// Split out from `CloudProvider::upload` so tests can point it at a local
/// mock server instead of the real Dropbox API.
fn upload_to(url: &str, access_token: &str, path: &str, bytes: &[u8]) -> AppResult<()> {
    let api_arg = format!(r#"{{"path":"{path}","mode":"overwrite","mute":true}}"#);
    ureq::post(url)
        .set("Authorization", &format!("Bearer {access_token}"))
        .set("Dropbox-API-Arg", &api_arg)
        .set("Content-Type", "application/octet-stream")
        .send_bytes(bytes)
        .map_err(|e| {
            AppError::Invalid(format!("Dropbox upload failed: {}", describe_ureq_error(e)))
        })?;
    Ok(())
}

fn download_from(url: &str, access_token: &str, path: &str) -> AppResult<Vec<u8>> {
    let api_arg = format!(r#"{{"path":"{path}"}}"#);
    let response = ureq::post(url)
        .set("Authorization", &format!("Bearer {access_token}"))
        .set("Dropbox-API-Arg", &api_arg)
        .call()
        .map_err(|e| {
            AppError::Invalid(format!(
                "Dropbox download failed: {}",
                describe_ureq_error(e)
            ))
        })?;
    let mut bytes = Vec::new();
    response
        .into_reader()
        .read_to_end(&mut bytes)
        .map_err(|e| AppError::Invalid(format!("couldn't read Dropbox download body: {e}")))?;
    Ok(bytes)
}

fn fetch_account_label_from(url: &str, access_token: &str) -> AppResult<Option<String>> {
    let response: serde_json::Value = ureq::post(url)
        .set("Authorization", &format!("Bearer {access_token}"))
        .set("Content-Type", "application/json")
        .send_string("null")
        .map_err(|e| {
            AppError::Invalid(format!(
                "couldn't fetch Dropbox account info: {}",
                describe_ureq_error(e)
            ))
        })?
        .into_json()
        .map_err(|e| AppError::Invalid(format!("invalid account info response: {e}")))?;
    Ok(response
        .get("email")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string()))
}

/// Minimal percent-encoding for a URL query component — the only untrusted
/// input here is `redirect_uri`, which is our own loopback URL
/// (`http://127.0.0.1:<port>/callback`), so this only needs to handle that
/// shape correctly, not be a general-purpose encoder.
fn urlencoding_encode(value: &str) -> String {
    value
        .bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            _ => format!("%{b:02X}"),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpListener;
    use std::sync::mpsc;
    use std::thread;

    #[test]
    fn authorize_url_requests_the_provider_scopes() {
        // Regression test: the first real connect attempt got a token
        // missing files.content.write because this URL never included a
        // `scope` param at all — Dropbox silently granted a token without
        // it instead of erroring at authorize time.
        let url = Dropbox.authorize_url("state-1", "challenge-1", "http://localhost:1234");

        assert!(url.contains("scope=files.content.write"));
        assert!(url.contains("files.content.read"));
        assert!(url.contains("account_info.read"));
    }

    struct CapturedRequest {
        headers: Vec<(String, String)>,
        body: Vec<u8>,
    }

    /// Spins up a throwaway local HTTP server that captures the single
    /// request it receives (headers + body) and replies with a canned
    /// response, so Dropbox API calls can be tested without hitting the
    /// real network.
    fn serve_and_capture(
        status_line: &'static str,
        response_body: &'static [u8],
        response_content_type: &'static str,
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

            let mut body = vec![0u8; content_length];
            if content_length > 0 {
                reader.read_exact(&mut body).unwrap();
            }
            tx.send(CapturedRequest { headers, body }).unwrap();

            let response_head = format!(
                "{status_line}\r\nContent-Type: {response_content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
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
    fn upload_to_sends_the_bytes_and_the_dropbox_api_arg_header() {
        let (url, rx) = serve_and_capture("HTTP/1.1 200 OK", b"{}", "application/json");

        upload_to(&url, "test-token", "/backup.enc", b"encrypted-bytes").unwrap();

        let captured = rx.recv().unwrap();
        assert_eq!(captured.body, b"encrypted-bytes");
        assert_eq!(
            header(&captured, "Authorization"),
            Some("Bearer test-token")
        );
        assert_eq!(
            header(&captured, "Dropbox-API-Arg"),
            Some(r#"{"path":"/backup.enc","mode":"overwrite","mute":true}"#)
        );
    }

    #[test]
    fn upload_to_surfaces_a_clean_error_on_failure_response() {
        let (url, _rx) = serve_and_capture(
            "HTTP/1.1 401 Unauthorized",
            br#"{"error_summary":"invalid_access_token/"}"#,
            "application/json",
        );

        let result = upload_to(&url, "bad-token", "/backup.enc", b"bytes");

        let err = result.expect_err("expected the 401 to surface as an error");
        let message = err.to_string();
        // The whole point of describe_ureq_error: Dropbox's actual
        // explanation (in the response body) must reach the caller, not
        // just a bare "status code 401".
        assert!(
            message.contains("invalid_access_token"),
            "error message should include Dropbox's response body, got: {message}"
        );
    }

    #[test]
    fn download_from_returns_the_response_body_bytes() {
        let (url, rx) = serve_and_capture(
            "HTTP/1.1 200 OK",
            b"the-encrypted-container-bytes",
            "application/octet-stream",
        );

        let bytes = download_from(&url, "test-token", "/backup.enc").unwrap();

        assert_eq!(bytes, b"the-encrypted-container-bytes");
        let captured = rx.recv().unwrap();
        assert_eq!(
            header(&captured, "Dropbox-API-Arg"),
            Some(r#"{"path":"/backup.enc"}"#)
        );
    }

    #[test]
    fn fetch_account_label_parses_the_email_field() {
        let (url, _rx) = serve_and_capture(
            "HTTP/1.1 200 OK",
            br#"{"account_id":"abc","email":"me@example.com"}"#,
            "application/json",
        );

        let label = fetch_account_label_from(&url, "test-token").unwrap();

        assert_eq!(label.as_deref(), Some("me@example.com"));
    }

    #[test]
    fn fetch_account_label_returns_none_without_an_email_field() {
        let (url, _rx) = serve_and_capture(
            "HTTP/1.1 200 OK",
            br#"{"account_id":"abc"}"#,
            "application/json",
        );

        let label = fetch_account_label_from(&url, "test-token").unwrap();

        assert_eq!(label, None);
    }
}
