"""Credential encryption + broker factory."""

import os
import json
from cryptography.fernet import Fernet

from app.core.brokers import BrokerBase, IBKRBroker, ColmexBroker
from app.core.brokers.alpaca import AlpacaBroker

_RAW_KEY = os.getenv("ENCRYPTION_KEY", "")
if _RAW_KEY:
    _fernet = Fernet(_RAW_KEY.encode() if isinstance(_RAW_KEY, str) else _RAW_KEY)
else:
    # Auto-generate a key in dev — not persistent between restarts, fine for dev
    _fernet = Fernet(Fernet.generate_key())


def encrypt_credentials(creds: dict) -> str:
    return _fernet.encrypt(json.dumps(creds).encode()).decode()


def decrypt_credentials(enc: str) -> dict:
    return json.loads(_fernet.decrypt(enc.encode()).decode())


def get_broker(broker_type: str, credentials_enc: str) -> BrokerBase:
    creds = decrypt_credentials(credentials_enc)
    match broker_type.lower():
        case "ibkr":
            return IBKRBroker(creds)
        case "colmex":
            return ColmexBroker(creds)
        case "alpaca":
            return AlpacaBroker(creds)
        case _:
            raise ValueError(f"Unknown broker type: {broker_type}")
