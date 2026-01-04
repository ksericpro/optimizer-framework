#  trigger the full end-to-end cycle
Invoke-RestMethod -Method Post -Uri "http://localhost:8000/optimize"

@{status=success; drivers_updated=3} @{status=success; routes_generated=3; orders_assigned=30}

# Fetch Driver Route
Invoke-RestMethod -Method Get -Uri "http://localhost:8000/drivers/6b77f0fc-5117-4aa8-a520-b5ee7ce8ba7c/route"

route_id                             status  stops
--------                             ------  -----
7c34d1e3-5ecb-4fbd-91bc-ddb85d54d46b PLANNED {@{stop_id=d7c3aeec-6cae-4603-8fe9-abec38f35ead; sequence_number=1; est...


# Update Stop Status
# Replace [STOP_ID] with an actual ID from the "Fetch Route" command above
Invoke-RestMethod -Method Patch -Uri "http://localhost:8000/stops/[STOP_ID]/status?status=DELIVERED"