from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import pandas as pd


MOTOR_PATH = Path(__file__).resolve().parents[1] / "src" / "motor_relatorio_os.py"
SPEC = importlib.util.spec_from_file_location("motor_relatorio_os", MOTOR_PATH)
motor = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(motor)


def record(message_id: str, text: str):
    return {
        "key": {"id": message_id, "remoteJid": "origem@g.us"},
        "message": {"conversation": text},
    }


class MatchingSafetyTest(unittest.TestCase):
    def setUp(self):
        self.row = {
            "OS": "123456",
            "Contrato": "7890",
            "CPF/CNPJ": "12345678901",
            "Cliente": "CLIENTE TESTE",
            "Conteúdo": "INSTALAÇÃO DE FIBRA NA RESIDÊNCIA DO CLIENTE",
        }

    def test_different_messages_with_same_high_score_require_review(self):
        messages = [
            record("a", "ID 7890 CPF 12345678901 CLIENTE TESTE instalação de fibra na residência do cliente"),
            record("b", "ID 7890 CPF 12345678901 CLIENTE TESTE instalação de fibra na residência do cliente bloco B"),
        ]

        result = motor.build_matches(pd.DataFrame([self.row]), messages)[0]

        self.assertEqual(result["MatchStatus"], "REVISAR")

    def test_single_strong_message_is_found(self):
        result = motor.build_matches(
            pd.DataFrame([self.row]),
            [record("a", "OS 123456 ID 7890 CPF 12345678901 CLIENTE TESTE")],
        )[0]

        self.assertEqual(result["MatchStatus"], "ENCONTRADA")


class ForwardConfirmationTest(unittest.TestCase):
    @patch.object(motor.requests, "post")
    def test_forward_requires_confirmed_message_id_and_destination(self, post):
        response = Mock(status_code=201)
        response.raise_for_status.return_value = None
        response.json.return_value = {"key": {"id": "sent-id", "remoteJid": "destino@g.us"}}
        post.return_value = response

        result = motor.forward_original_record(
            "http://evolution", "instance", {"apikey": "test"}, "destino@g.us", {"message": {"conversation": "ok"}}
        )

        self.assertEqual(result["key"]["id"], "sent-id")

    @patch.object(motor.requests, "post")
    def test_forward_rejects_success_without_message_id(self, post):
        response = Mock(status_code=201)
        response.raise_for_status.return_value = None
        response.json.return_value = {"ok": True}
        post.return_value = response

        with self.assertRaisesRegex(RuntimeError, "não confirmou o ID"):
            motor.forward_original_record(
                "http://evolution", "instance", {"apikey": "test"}, "destino@g.us", {"message": {"conversation": "ok"}}
            )


if __name__ == "__main__":
    unittest.main()
