"""TLS verification against the OS certificate store.

Behind a TLS-inspecting antivirus or corporate proxy (Avast, Zscaler...)
the certificate chain is re-signed with a root that lives in the Windows
store but not in certifi's bundle, so every outbound HTTPS call dies with
CERTIFICATE_VERIFY_FAILED. truststore makes Python verify against the OS
store instead, which is where that root already is.

Importing this module performs the injection, once per process (module
caching does the deduplication). Import it FIRST, before the HTTP client
it has to cover: the injection swaps ssl.SSLContext, so a client imported
earlier keeps the old one and stays broken.

    import tls_setup  # noqa: F401  (must precede the HTTP client import)

    import requests

Every module that opens a network connection imports it already
(openai_service, voice_pipeline, cognito_service), so an ordinary script
importing one of those is covered without doing anything. Only a script
that reaches the network on its own needs the line above.
"""

import truststore

truststore.inject_into_ssl()
