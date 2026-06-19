TOKEN=4cda38b8-8d55-42b2-a281-71ac5ec5df1d

# Check deployments
curl -s -X POST "https://backboard.railway.app/graphql/v2" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
  -H "Accept: application/json" \
  -d '{"query":"{ deployments(input: {projectId: \"edd372c2-6336-4ad1-8d33-106294870fdc\", first: 5}) { edges { node { id status serviceId serviceName createdAt url } } } }"}'
