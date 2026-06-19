TOKEN=4cda38b8-8d55-42b2-a281-71ac5ec5df1d
SERVICE_ID=11754f79-2cc3-4825-87ed-b14efd7774b2
ENV_ID=6af604e7-4a72-417c-bcc2-1e8ae3891088

echo "=== Trying to generate a railway domain ==="
curl -s -X POST "https://backboard.railway.app/graphql/v2" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
  -H "Accept: application/json" \
  -d "{\"query\":\"mutation { serviceDomainCreate(serviceId: \\\"$SERVICE_ID\\\", environmentId: \\\"$ENV_ID\\\", generateSubdomain: true) { domain } }\"}" 2>&1 | python3 -m json.tool
