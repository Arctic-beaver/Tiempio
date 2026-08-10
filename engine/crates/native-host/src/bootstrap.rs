use std::env;
use std::fmt::Write as _;
use std::io::{self, Write};

use serde_json::json;
use sha2::{Digest, Sha256};
use tiempio_engine_protocol::{ENGINE_PROTOCOL_VERSION, encode_frame};

const BOOTSTRAP_VERSION: u32 = 1;
const TOKEN_ENVIRONMENT_KEY: &str = "TIEMPIO_NATIVE_HOST_TOKEN";
const MINIMUM_TOKEN_BYTES: usize = 32;
const MAXIMUM_TOKEN_BYTES: usize = 256;

pub(crate) fn write_environment_acknowledgement() -> Result<(), ()> {
    let token = env::var(TOKEN_ENVIRONMENT_KEY).map_err(|_| ())?;
    let body = acknowledgement_body(&token)?;
    let frame = encode_frame(&body).map_err(|_| ())?;
    let stdout = io::stdout();
    let mut output = stdout.lock();
    output.write_all(&frame).map_err(|_| ())?;
    output.flush().map_err(|_| ())
}

fn acknowledgement_body(token: &str) -> Result<Vec<u8>, ()> {
    if !(MINIMUM_TOKEN_BYTES..=MAXIMUM_TOKEN_BYTES).contains(&token.len()) || !token.is_ascii() {
        return Err(());
    }
    let digest = Sha256::digest(token.as_bytes());
    let mut token_digest = String::with_capacity(7 + digest.len() * 2);
    token_digest.push_str("sha256:");
    for byte in digest {
        write!(&mut token_digest, "{byte:02X}").map_err(|_| ())?;
    }
    serde_json::to_vec(&json!({
        "bootstrapVersion": BOOTSTRAP_VERSION,
        "engineProtocolVersion": ENGINE_PROTOCOL_VERSION,
        "tokenDigest": token_digest,
    }))
    .map_err(|_| ())
}

#[cfg(test)]
mod tests {
    use super::acknowledgement_body;

    #[test]
    fn acknowledges_only_bounded_ascii_tokens_without_disclosing_them() {
        let token = "0123456789ABCDEF0123456789ABCDEF";
        let body = acknowledgement_body(token).expect("bounded token should be accepted");
        let text = String::from_utf8(body).expect("acknowledgement is UTF-8 JSON");
        assert!(!text.contains(token));
        assert!(
            text.contains(
                "sha256:CD6C1F7D1DC6717D6371D2647910CA71BA3BF0B611083D322466B8843B4285B6"
            )
        );
        assert!(acknowledgement_body("short").is_err());
        assert!(acknowledgement_body(&"A".repeat(257)).is_err());
    }
}
