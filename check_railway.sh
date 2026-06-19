TOKEN=4cda38b8-8d55-42b2-a281-71ac5ec5df1d

# Query 1: Check project deployments
curl -s -X POST "https://backboard.railway.app/graphql/v2" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
  -H "Accept: application/json" \
  -d '{"query":"{ project(id: \"edd372c2-6336-4ad1-8d33-106294870fdc\") { name services { edges { node { id name source { repo branch } deployments(first: 1) { edges { node { id status createdAt } } } } } } } }"}'
