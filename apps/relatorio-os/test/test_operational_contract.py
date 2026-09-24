import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

MOTOR_PATH = Path(__file__).resolve().parents[1] / "src" / "motor_relatorio_os.py"
SPEC = importlib.util.spec_from_file_location("motor_relatorio_os_contract", MOTOR_PATH)
motor = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(motor)


class OperationalContractTests(unittest.TestCase):
    def test_writes_structured_contract_without_message_payload(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            preview = out / "preview.csv"
            preview.write_text("fixture", encoding="utf-8")
            contract = motor.write_execution_contract(
                out, "exec-fixture", "import-fixture", "ui", "fixture.csv",
                "2026-01-15T12:00:00+00:00", "2026-01-15T12:01:00+00:00", "completed",
                [{"row": 1}], [], [{"row": 1}], None,
                [motor._artifact(preview, "preview")],
            )
            self.assertEqual(contract["executionId"], "exec-fixture")
            self.assertEqual(contract["rowsRead"], 1)
            self.assertEqual(contract["artifacts"][0]["type"], "preview")
            self.assertNotIn("MensagemEncontrada", json.dumps(contract))
            self.assertTrue((out / "execution_result_exec-fixture.json").exists())


if __name__ == "__main__":
    unittest.main()
