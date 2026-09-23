use serde::{Deserialize, Serialize};

pub const LAN_PROTOCOL_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ClientControlMessage {
    Hello {
        client_id: String,
        platform: ClientPlatform,
    },
    Ping {
        nonce: u64,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ServerControlMessage {
    HostHello {
        protocol_version: u32,
        host_name: String,
    },
    ClientAccepted {
        client_id: String,
    },
    Pong {
        nonce: u64,
    },
    Error {
        message: String,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ClientPlatform {
    Windows,
    Android,
    Web,
    Unknown,
}

pub fn encode_client_message(
    message: &ClientControlMessage,
) -> Result<String, serde_json::Error> {
    serde_json::to_string(message)
}

pub fn decode_client_message(raw: &str) -> Result<ClientControlMessage, serde_json::Error> {
    serde_json::from_str(raw)
}

pub fn encode_server_message(
    message: &ServerControlMessage,
) -> Result<String, serde_json::Error> {
    serde_json::to_string(message)
}

pub fn decode_server_message(raw: &str) -> Result<ServerControlMessage, serde_json::Error> {
    serde_json::from_str(raw)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn control_protocol_round_trips() {
        let input = r#"{"type":"hello","client_id":"android-01","platform":"android"}"#;
        let decoded = decode_client_message(input).expect("decode client hello");

        assert_eq!(
            decoded,
            ClientControlMessage::Hello {
                client_id: "android-01".into(),
                platform: ClientPlatform::Android,
            }
        );

        let encoded = encode_client_message(&ClientControlMessage::Ping { nonce: 7 })
            .expect("encode client ping");
        assert_eq!(encoded, r#"{"type":"ping","nonce":7}"#);

        let server_encoded = encode_server_message(&ServerControlMessage::Pong { nonce: 42 })
            .expect("encode pong");
        assert_eq!(server_encoded, r#"{"type":"pong","nonce":42}"#);

        let server_decoded =
            decode_server_message(r#"{"type":"host_hello","protocol_version":1,"host_name":"pc-a"}"#)
                .expect("decode host hello");
        assert_eq!(
            server_decoded,
            ServerControlMessage::HostHello {
                protocol_version: LAN_PROTOCOL_VERSION,
                host_name: "pc-a".into(),
            }
        );
    }
}
