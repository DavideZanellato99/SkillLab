"""The root endpoint doubles as the health check hit by the compose smoke test."""


def test_root_health(client):
    response = client.get("/")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
