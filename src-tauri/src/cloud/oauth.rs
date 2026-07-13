use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};

use aes_gcm::aead::{rand_core::RngCore, OsRng};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

use crate::cloud::CloudProvider;
use crate::error::{AppError, AppResult};

/// A random, URL-safe token suitable for both the PKCE `code_verifier` and
/// the CSRF-style `state` param — both just need to be unguessable and
/// unreserved-charset-safe, so one generator covers both.
fn random_url_safe_token() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn code_challenge_for(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(digest)
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok();
                match hex.and_then(|h| u8::from_str_radix(h, 16).ok()) {
                    Some(byte) => {
                        out.push(byte);
                        i += 3;
                    }
                    None => {
                        out.push(bytes[i]);
                        i += 1;
                    }
                }
            }
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn parse_query_string(query: &str) -> HashMap<String, String> {
    query
        .split('&')
        .filter(|pair| !pair.is_empty())
        .filter_map(|pair| {
            let mut parts = pair.splitn(2, '=');
            let key = parts.next()?;
            let value = parts.next().unwrap_or("");
            Some((percent_decode(key), percent_decode(value)))
        })
        .collect()
}

pub struct CallbackResult {
    pub code: String,
    pub state: String,
}

const CALLBACK_RESPONSE_BODY: &str =
    "<html><body>Connected. You can close this tab and return to Kankouin.</body></html>";

/// Accepts exactly one connection on `listener`, treats it as the OAuth
/// redirect, and responds with a static "you're done" page so the browser
/// doesn't show a broken-connection error. Blocks until that one request
/// arrives — callers are expected to have already opened the consent screen
/// in the system browser before calling this.
pub fn accept_one_callback(listener: &TcpListener) -> AppResult<CallbackResult> {
    let (stream, _) = listener.accept()?;
    handle_callback_connection(stream)
}

fn handle_callback_connection(mut stream: TcpStream) -> AppResult<CallbackResult> {
    let mut reader = BufReader::new(stream.try_clone()?);
    let mut request_line = String::new();
    reader.read_line(&mut request_line)?;

    let path = request_line
        .split_whitespace()
        .nth(1)
        .ok_or_else(|| AppError::Invalid("malformed redirect request".into()))?;
    let query = path.split_once('?').map(|x| x.1).unwrap_or("");
    let params = parse_query_string(query);

    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        CALLBACK_RESPONSE_BODY.len(),
        CALLBACK_RESPONSE_BODY
    );
    stream.write_all(response.as_bytes())?;

    if let Some(err) = params.get("error") {
        return Err(AppError::Invalid(format!("authorization denied: {err}")));
    }
    let code = params
        .get("code")
        .cloned()
        .ok_or_else(|| AppError::Invalid("redirect had no authorization code".into()))?;
    let state = params.get("state").cloned().unwrap_or_default();
    Ok(CallbackResult { code, state })
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
}

/// Exchanges an authorization `code` for tokens. `token_url`/`client_id` are
/// plain strings rather than a `&dyn CloudProvider` — this function doesn't
/// need to know providers exist, which is what makes it testable against a
/// throwaway local HTTP server instead of a real OAuth endpoint.
fn exchange_code(
    token_url: &str,
    client_id: &str,
    code: &str,
    code_verifier: &str,
    redirect_uri: &str,
) -> AppResult<TokenResponse> {
    ureq::post(token_url)
        .send_form(&[
            ("grant_type", "authorization_code"),
            ("code", code),
            ("client_id", client_id),
            ("code_verifier", code_verifier),
            ("redirect_uri", redirect_uri),
        ])
        .map_err(|e| {
            AppError::Invalid(format!(
                "token exchange failed: {}",
                crate::cloud::describe_ureq_error(e)
            ))
        })?
        .into_json()
        .map_err(|e| AppError::Invalid(format!("invalid token response: {e}")))
}

/// Exchanges a stored `refresh_token` for a fresh access token.
pub fn refresh_access_token(
    token_url: &str,
    client_id: &str,
    refresh_token: &str,
) -> AppResult<String> {
    let response: TokenResponse = ureq::post(token_url)
        .send_form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
            ("client_id", client_id),
        ])
        .map_err(|e| {
            AppError::Invalid(format!(
                "token refresh failed: {}",
                crate::cloud::describe_ureq_error(e)
            ))
        })?
        .into_json()
        .map_err(|e| AppError::Invalid(format!("invalid token response: {e}")))?;
    Ok(response.access_token)
}

pub struct ConnectResult {
    pub refresh_token: String,
    pub account_label: Option<String>,
}

/// Runs the full connect flow for `provider`: opens the system browser to
/// its consent screen, blocks on a throwaway loopback listener for the
/// redirect, exchanges the code for tokens, and fetches an account label
/// for display. Everything provider-specific goes through the trait; this
/// function itself never changes when a new provider is added.
pub fn run_connect_flow(app: &AppHandle, provider: &dyn CloudProvider) -> AppResult<ConnectResult> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    // Dropbox's documented loopback convention for desktop apps is to
    // register exactly "http://localhost" (no port, no path) and have it
    // match any port at request time — so this needs to use the hostname
    // "localhost", not the 127.0.0.1 literal, and no path suffix, to line
    // up with what's registered in the app console.
    let redirect_uri = format!("http://localhost:{port}");

    let code_verifier = random_url_safe_token();
    let code_challenge = code_challenge_for(&code_verifier);
    let state = random_url_safe_token();

    let authorize_url = provider.authorize_url(&state, &code_challenge, &redirect_uri);
    app.opener()
        .open_url(authorize_url, None::<&str>)
        .map_err(|e| AppError::Invalid(format!("couldn't open the browser: {e}")))?;

    let callback = accept_one_callback(&listener)?;
    if callback.state != state {
        return Err(AppError::Invalid(
            "authorization response didn't match the request (possible CSRF)".into(),
        ));
    }

    let tokens = exchange_code(
        provider.token_url(),
        provider.client_id(),
        &callback.code,
        &code_verifier,
        &redirect_uri,
    )?;
    let refresh_token = tokens
        .refresh_token
        .ok_or_else(|| AppError::Invalid("provider didn't return a refresh token".into()))?;

    let account_label = provider.account_label(&tokens.access_token).unwrap_or(None);

    Ok(ConnectResult {
        refresh_token,
        account_label,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;
    use std::thread;

    #[test]
    fn code_challenge_matches_known_rfc7636_test_vector() {
        // From RFC 7636 appendix B.
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        assert_eq!(
            code_challenge_for(verifier),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn random_tokens_are_unreserved_charset_and_not_repeated() {
        let a = random_url_safe_token();
        let b = random_url_safe_token();
        assert_ne!(a, b);
        assert!(a
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
    }

    #[test]
    fn parse_query_string_decodes_percent_and_plus() {
        let params = parse_query_string("code=abc%2Fdef&state=hello+world");
        assert_eq!(params.get("code").unwrap(), "abc/def");
        assert_eq!(params.get("state").unwrap(), "hello world");
    }

    #[test]
    fn accept_one_callback_parses_code_and_state_from_a_real_request() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();

        let client = thread::spawn(move || {
            let mut stream = TcpStream::connect(addr).unwrap();
            stream
                .write_all(b"GET /callback?code=auth-code-123&state=xyz HTTP/1.1\r\nHost: localhost\r\n\r\n")
                .unwrap();
            let mut response = String::new();
            stream.read_to_string(&mut response).ok();
            response
        });

        let result = accept_one_callback(&listener).unwrap();
        assert_eq!(result.code, "auth-code-123");
        assert_eq!(result.state, "xyz");

        let response = client.join().unwrap();
        assert!(response.starts_with("HTTP/1.1 200 OK"));
    }

    #[test]
    fn accept_one_callback_surfaces_provider_error() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();

        thread::spawn(move || {
            let mut stream = TcpStream::connect(addr).unwrap();
            stream
                .write_all(b"GET /callback?error=access_denied HTTP/1.1\r\nHost: localhost\r\n\r\n")
                .unwrap();
        });

        let result = accept_one_callback(&listener);
        assert!(matches!(result, Err(AppError::Invalid(_))));
    }

    /// Spins up a throwaway local HTTP server that replies once with `body`
    /// to any request, so token-exchange/refresh calls can be tested
    /// end-to-end without a real OAuth provider.
    fn serve_one_json_response(body: &'static str) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            let mut line = String::new();
            reader.read_line(&mut line).ok();
            // Drain headers so the client's request isn't left half-read.
            loop {
                let mut header_line = String::new();
                if reader.read_line(&mut header_line).unwrap_or(0) == 0 {
                    break;
                }
                if header_line == "\r\n" {
                    break;
                }
            }
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(response.as_bytes()).unwrap();
        });
        format!("http://{addr}")
    }

    #[test]
    fn exchange_code_parses_access_and_refresh_token() {
        let url = serve_one_json_response(
            r#"{"access_token":"access-1","refresh_token":"refresh-1","token_type":"bearer"}"#,
        );
        let tokens = exchange_code(
            &url,
            "client-id",
            "code",
            "verifier",
            "http://127.0.0.1:1/callback",
        )
        .unwrap();
        assert_eq!(tokens.access_token, "access-1");
        assert_eq!(tokens.refresh_token.as_deref(), Some("refresh-1"));
    }

    #[test]
    fn refresh_access_token_parses_access_token() {
        let url = serve_one_json_response(r#"{"access_token":"access-2","token_type":"bearer"}"#);
        let access_token = refresh_access_token(&url, "client-id", "refresh-1").unwrap();
        assert_eq!(access_token, "access-2");
    }
}
