use aes_gcm::aead::{rand_core::RngCore, Aead, AeadCore, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use argon2::Argon2;

use crate::error::{AppError, AppResult};

// Container layout: MAGIC (4 bytes "KANK") | VERSION (1 byte) |
// SALT (16 bytes) | NONCE (12 bytes) | CIPHERTEXT+TAG (rest).
// Key = Argon2id(passphrase, SALT), 32 bytes. Cipher = AES-256-GCM.
// A fresh random SALT and NONCE are generated on every call to `encrypt`,
// so encrypting the same plaintext twice never produces the same bytes.
const MAGIC: &[u8; 4] = b"KANK";
const VERSION: u8 = 1;
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;
const KEY_LEN: usize = 32;
const HEADER_LEN: usize = MAGIC.len() + 1 + SALT_LEN + NONCE_LEN;

fn derive_key(passphrase: &str, salt: &[u8]) -> AppResult<[u8; KEY_LEN]> {
    let mut key = [0u8; KEY_LEN];
    Argon2::default()
        .hash_password_into(passphrase.as_bytes(), salt, &mut key)
        .map_err(|_| AppError::Decrypt)?;
    Ok(key)
}

pub fn encrypt(passphrase: &str, plaintext: &[u8]) -> AppResult<Vec<u8>> {
    let mut salt = [0u8; SALT_LEN];
    OsRng.fill_bytes(&mut salt);

    let key_bytes = derive_key(passphrase, &salt)?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key_bytes));
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);

    let ciphertext = cipher
        .encrypt(&nonce, plaintext)
        .map_err(|_| AppError::Decrypt)?;

    let mut out = Vec::with_capacity(HEADER_LEN + ciphertext.len());
    out.extend_from_slice(MAGIC);
    out.push(VERSION);
    out.extend_from_slice(&salt);
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

pub fn decrypt(passphrase: &str, container: &[u8]) -> AppResult<Vec<u8>> {
    if container.len() < HEADER_LEN {
        return Err(AppError::Invalid("encrypted file is too short".into()));
    }

    let (magic, rest) = container.split_at(MAGIC.len());
    if magic != MAGIC {
        return Err(AppError::Invalid("not a Kankouin encrypted file".into()));
    }

    let (version, rest) = rest.split_at(1);
    if version[0] != VERSION {
        return Err(AppError::Invalid(format!(
            "unsupported format version {}",
            version[0]
        )));
    }

    let (salt, rest) = rest.split_at(SALT_LEN);
    let (nonce_bytes, ciphertext) = rest.split_at(NONCE_LEN);

    let key_bytes = derive_key(passphrase, salt)?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key_bytes));
    let nonce = Nonce::from_slice(nonce_bytes);

    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| AppError::Decrypt)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_returns_original_bytes() {
        let container = encrypt("correct horse battery staple", b"hello world").unwrap();
        let plaintext = decrypt("correct horse battery staple", &container).unwrap();
        assert_eq!(plaintext, b"hello world");
    }

    #[test]
    fn roundtrip_handles_empty_and_large_input() {
        for size in [0, 1, 1_000_000] {
            let plaintext = vec![0xABu8; size];
            let container = encrypt("pw", &plaintext).unwrap();
            assert_eq!(decrypt("pw", &container).unwrap(), plaintext);
        }
    }

    #[test]
    fn wrong_passphrase_fails_cleanly() {
        let container = encrypt("right passphrase", b"secret").unwrap();
        let result = decrypt("wrong passphrase", &container);
        assert!(matches!(result, Err(AppError::Decrypt)));
    }

    #[test]
    fn corrupted_ciphertext_fails_cleanly() {
        let mut container = encrypt("pw", b"secret").unwrap();
        let last = container.len() - 1;
        container[last] ^= 0xFF;
        assert!(matches!(decrypt("pw", &container), Err(AppError::Decrypt)));
    }

    #[test]
    fn malformed_container_is_rejected_not_panicking() {
        assert!(decrypt("pw", &[]).is_err());
        assert!(decrypt("pw", b"not a real container").is_err());
    }

    #[test]
    fn same_plaintext_encrypts_differently_each_time() {
        let a = encrypt("pw", b"secret").unwrap();
        let b = encrypt("pw", b"secret").unwrap();
        assert_ne!(a, b, "salt/nonce must be freshly random per call");
    }
}
