$ErrorActionPreference = "Stop"

Write-Host "=== V1 Smoke Test Start ==="

# 1) Health
$backendHealth = Invoke-RestMethod -Method Get -Uri "http://localhost:8080/health"
$workerHealth = Invoke-RestMethod -Method Get -Uri "http://localhost:8090/health"
Write-Host "Backend health:" ($backendHealth | ConvertTo-Json -Compress)
Write-Host "Worker health:" ($workerHealth | ConvertTo-Json -Compress)

# 2) Auth + Create Room
$guest = Invoke-RestMethod -Method Post -Uri "http://localhost:8080/api/v1/auth/guest" `
  -ContentType "application/json" `
  -Body '{"display_name":"Guest Smoke"}'

$roomCreate = Invoke-RestMethod -Method Post -Uri "http://localhost:8080/api/v1/rooms" `
  -ContentType "application/json" `
  -Body '{
    "host_user_id":"host_smoke_001",
    "host_identity":"host_device_smoke_001",
    "host_display_name":"Host Smoke",
    "provider_profile":"silero+google_stt+openai_translate+google_tts",
    "supported_languages":["vi","en"],
    "host_settings":{"source_language":"vi","target_language":"en","voice_profile":"host-default"}
  }'

$roomId = $roomCreate.room.roomId
$sessionId = $roomCreate.room.sessionId

# 3) Join Room
$join = Invoke-RestMethod -Method Post -Uri "http://localhost:8080/api/v1/rooms/join" `
  -ContentType "application/json" `
  -Body "{
    `"room_id`":`"$roomId`",
    `"guest_user_id`":`"$($guest.user.userId)`",
    `"guest_identity`":`"guest_device_smoke_001`",
    `"guest_display_name`":`"Guest Smoke`",
    `"guest_settings`":{`"source_language`":`"en`",`"target_language`":`"vi`",`"voice_profile`":`"guest-default`"}
  }"

Write-Host "Join worker_session:" ($join.worker_session | ConvertTo-Json -Compress)

# 4) Simulate host utterance VI -> EN
$simHost = Invoke-RestMethod -Method Post -Uri "http://localhost:8090/internal/sessions/$sessionId/simulate-utterance" `
  -ContentType "application/json" `
  -Body '{"speaker_identity":"host_device_smoke_001","text":"xin chao toi dang smoke test"}'

Write-Host "Sim host events count:" $simHost.events.Count

# 5) Simulate guest utterance EN -> VI
$simGuest = Invoke-RestMethod -Method Post -Uri "http://localhost:8090/internal/sessions/$sessionId/simulate-utterance" `
  -ContentType "application/json" `
  -Body '{"speaker_identity":"guest_device_smoke_001","text":"hello i am smoke testing"}'

Write-Host "Sim guest events count:" $simGuest.events.Count

# 6) Verify history
$history = Invoke-RestMethod -Method Get -Uri ("http://localhost:8080/api/v1/history?session_id={0}" -f $sessionId)
Write-Host "History items:" $history.items.Count
Write-Host ($history | ConvertTo-Json -Depth 12)

# 7) End room
$end = Invoke-RestMethod -Method Post -Uri ("http://localhost:8080/api/v1/rooms/{0}/end" -f $roomId)
Write-Host "End response:" ($end | ConvertTo-Json -Compress)

Write-Host "=== V1 Smoke Test Completed ==="
