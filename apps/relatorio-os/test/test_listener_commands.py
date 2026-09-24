from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import unittest
from unittest.mock import patch


LISTENER_PATH = Path(__file__).resolve().parents[1] / "src" / "COMANDO_WHATSAPP_RELATORIO_USUARIOS.py"
SPEC = importlib.util.spec_from_file_location("relatorio_listener", LISTENER_PATH)
listener = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(listener)


SYNTHETIC_CONTACT = "5511999990000"


def message(text, sender=f"{SYNTHETIC_CONTACT}@s.whatsapp.net"):
    return {
        "key": {"id": "msg-1", "remoteJid": sender, "fromMe": False},
        "pushName": "Contato Teste",
        "message": {"conversation": text},
    }


class ListenerCommandTest(unittest.TestCase):
    def test_teamo_parser_normalizes_command(self):
        self.assertEqual(listener.norm_cmd("  !TE AMO  "), "!te amo")
        self.assertIn(listener.norm_cmd("!teamo"), {listener.norm_cmd(x) for x in listener.COMANDOS_TEAMO})


    def test_teamo_contact_uses_configured_sender_and_handler_sends_expected_reply(self):
        rec = message("!te amo")
        with patch.dict(os.environ, {"RELATORIO_TEAMO_CONTATO": SYNTHETIC_CONTACT}, clear=False):
            self.assertTrue(listener.is_teamo_contact(rec))
            self.assertEqual(listener.resolve_private_reply_jid(rec), f"{SYNTHETIC_CONTACT}@s.whatsapp.net")

            with patch.object(listener, "send_text") as send_text, patch.object(listener, "write_log"):
                destination = listener.handle_teamo("http://evolution", "instance", {"apikey": "test"}, rec)

            self.assertEqual(destination, f"{SYNTHETIC_CONTACT}@s.whatsapp.net")
            send_text.assert_called_once_with(
                "http://evolution",
                "instance",
                {"apikey": "test"},
                f"{SYNTHETIC_CONTACT}@s.whatsapp.net",
                listener.teamo_message_value(),
            )


    def test_other_sender_does_not_match_teamo_contact(self):
        with patch.dict(os.environ, {"RELATORIO_TEAMO_CONTATO": SYNTHETIC_CONTACT}, clear=False):
            self.assertFalse(listener.is_teamo_contact(message("!te amo", "5511888880000@s.whatsapp.net")))


    def test_teamo_is_disabled_without_external_contact_configuration(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(listener.teamo_contact_value(), "")
            self.assertFalse(listener.is_teamo_contact(message("!te amo")))


    def test_other_command_does_not_match_teamo_parser(self):
        self.assertNotIn(listener.norm_cmd("!relatorio local"), {listener.norm_cmd(x) for x in listener.COMANDOS_TEAMO})
