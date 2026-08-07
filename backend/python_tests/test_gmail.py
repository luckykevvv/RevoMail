from backend.app.services.gmail import _sanitise_html


def test_email_html_removes_executable_content():
    cleaned = _sanitise_html('<p>Hello</p><script>alert(1)</script><img src="https://tracker.example/pixel">')
    assert "script" not in cleaned
    assert "alert(1)" not in cleaned
    assert "Hello" in cleaned
