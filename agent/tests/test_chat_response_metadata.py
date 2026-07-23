from types import SimpleNamespace

from src.providers.chat import ChatLLM


def test_parse_response_keeps_provider_reported_model_and_fingerprint() -> None:
    message = SimpleNamespace(
        content="hello",
        tool_calls=[],
        additional_kwargs={},
        response_metadata={
            "finish_reason": "stop",
            "model_name": "deepseek-v4-flash-202607",
            "system_fingerprint": "fp_deepseek_123",
        },
        usage_metadata=None,
    )

    response = ChatLLM._parse_response(message)

    assert response.response_model == "deepseek-v4-flash-202607"
    assert response.system_fingerprint == "fp_deepseek_123"
