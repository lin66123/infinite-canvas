TOKEN=4cda38b8-8d55-42b2-a281-71ac5ec5df1d
SERVICE_ID=11754f79-2cc3-4825-87ed-b14efd7774b2
ENV_ID=6af604e7-4a72-417c-bcc2-1e8ae3891088

# Update the service with GitHub source and deployment commands
curl -s -X POST "https://backboard.railway.app/graphql/v2" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
  -H "Accept: application/json" \
  -d '{
    "query": "mutation serviceInstanceConfigUpdate($input: ServiceInstanceConfigUpdateInput!) { serviceInstanceConfigUpdate(input: $input) { id } }",
    "variables": {
      "input": {
        "environmentId": "'$ENV_ID'",
        "serviceId": "'$SERVICE_ID'",
        "startCommand": "cd api && node server.js",
        "buildCommand": "cd api && npm install",
        "healthcheckPath": "/api/images",
        "healthcheckTimeout": 300
      }
    }
  }' 2>&1 | python3 -m json.tool
