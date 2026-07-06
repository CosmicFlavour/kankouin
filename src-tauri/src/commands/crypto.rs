use crate::error::AppResult;

// Planned container layout: MAGIC (4 bytes "KANK") | VERSION (1 byte) |
// SALT (16 bytes) | NONCE (12 bytes) | CIPHERTEXT+TAG (rest).
// Key = Argon2id(passphrase, SALT). Cipher = AES-256-GCM.
// A fresh random SALT and NONCE are generated on every call to `encrypt`,
// so encrypting the same plaintext twice never produces the same bytes.

pub fn encrypt(_passphrase: &str, _plaintext: &[u8]) -> AppResult<Vec<u8>> {
    todo!("Argon2id-derive a key from a fresh salt, AES-256-GCM seal with a fresh nonce")
}

pub fn decrypt(_passphrase: &str, _container: &[u8]) -> AppResult<Vec<u8>> {
    todo!(
        "parse MAGIC/VERSION/salt/nonce, derive the key, AES-256-GCM open; \
         map any parse or auth-tag failure to AppError::Decrypt, never panic"
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::AppError;

    #[test]
    #[ignore = "crypto.rs not implemented yet"]
    fn roundtrip_returns_original_bytes() {
        let container = encrypt("correct horse battery staple", b"hello world").unwrap();
        let plaintext = decrypt("correct horse battery staple", &container).unwrap();
        assert_eq!(plaintext, b"hello world");
    }

    #[test]
    #[ignore = "crypto.rs not implemented yet"]
    fn roundtrip_handles_empty_and_large_input() {
        for size in [0, 1, 1_000_000] {
            let plaintext = vec![0xABu8; size];
            let container = encrypt("pw", &plaintext).unwrap();
            assert_eq!(decrypt("pw", &container).unwrap(), plaintext);
        }
    }

    #[test]
    #[ignore = "crypto.rs not implemented yet"]
    fn wrong_passphrase_fails_cleanly() {
        let container = encrypt("right passphrase", b"secret").unwrap();
        let result = decrypt("wrong passphrase", &container);
        assert!(matches!(result, Err(AppError::Decrypt)));
    }

    #[test]
    #[ignore = "crypto.rs not implemented yet"]
    fn corrupted_ciphertext_fails_cleanly() {
        let mut container = encrypt("pw", b"secret").unwrap();
        let last = container.len() - 1;
        container[last] ^= 0xFF;
        assert!(matches!(decrypt("pw", &container), Err(AppError::Decrypt)));
    }

    #[test]
    #[ignore = "crypto.rs not implemented yet"]
    fn malformed_container_is_rejected_not_panicking() {
        assert!(decrypt("pw", &[]).is_err());
        assert!(decrypt("pw", b"not a real container").is_err());
    }

    #[test]
    #[ignore = "crypto.rs not implemented yet"]
    fn same_plaintext_encrypts_differently_each_time() {
        let a = encrypt("pw", b"secret").unwrap();
        let b = encrypt("pw", b"secret").unwrap();
        assert_ne!(a, b, "salt/nonce must be freshly random per call");
    }
}
