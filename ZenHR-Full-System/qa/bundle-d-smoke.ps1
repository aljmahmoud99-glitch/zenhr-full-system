$ErrorActionPreference = "Continue"

$base = "http://localhost:3001"
$accounts = @("hr", "payroll", "manager", "employee", "recruiter", "admin")
$tokens = @{}
$loginResults = @()

foreach ($u in $accounts) {
  try {
    $body = @{ username = $u; password = "Admin@1234" } | ConvertTo-Json
    $r = Invoke-RestMethod -Method Post -Uri "$base/api/auth/login" -ContentType "application/json" -Body $body
    $tokens[$u] = $r.data.accessToken
    $loginResults += [PSCustomObject]@{
      user = $u
      status = 200
      success = $r.success
      role = $r.data.user.role
      companyId = $r.data.user.companyId
      employeeId = $r.data.user.employeeId
    }
  } catch {
    $loginResults += [PSCustomObject]@{
      user = $u
      status = "error"
      error = $_.Exception.Message
    }
  }
}

function Get-ShortBody($response) {
  if (-not $response) { return $null }
  try {
    $stream = $response.GetResponseStream()
    if (-not $stream) { return $null }
    $reader = New-Object IO.StreamReader($stream)
    $body = ($reader.ReadToEnd() -replace "\s+", " ").Trim()
    if ($body.Length -gt 220) { return $body.Substring(0, 220) }
    return $body
  } catch {
    return $null
  }
}

function Expected-Status($name, $user, $path) {
  if ($name -eq "production_export" -and $path -like "*/payroll?format=*" -and @("employee", "recruiter") -contains $user) { return 403 }
  if ($name -eq "production_export" -and $path -like "*/employees?format=*" -and $user -eq "admin") { return 403 }
  if ($name -eq "payroll_summary_rbac" -and @("manager", "employee", "recruiter", "admin") -contains $user) { return 403 }
  return 200
}

function Test-Api($name, $user, $method, $path) {
  $headers = @{}
  if ($user -and $tokens.ContainsKey($user)) {
    $headers.Authorization = "Bearer $($tokens[$user])"
  }

  try {
    $resp = Invoke-WebRequest -UseBasicParsing -Method $method -Uri "$base$path" -Headers $headers -ErrorAction Stop
    return [PSCustomObject]@{
      name = $name
      user = $user
      method = $method
      path = $path
      status = [int]$resp.StatusCode
      expectedStatus = Expected-Status $name $user $path
      contentType = $resp.Headers["Content-Type"]
      bytes = $resp.RawContentLength
      rawOk = ($resp.StatusCode -lt 400)
      passed = ([int]$resp.StatusCode -eq (Expected-Status $name $user $path))
    }
  } catch {
    $status = $null
    if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
    $expected = Expected-Status $name $user $path
    return [PSCustomObject]@{
      name = $name
      user = $user
      method = $method
      path = $path
      status = $status
      expectedStatus = $expected
      error = $_.Exception.Message
      body = Get-ShortBody $_.Exception.Response
      rawOk = $false
      passed = ($status -eq $expected)
    }
  }
}

$tests = @()
$tests += Test-Api "health" $null "GET" "/api/healthz"

foreach ($u in $accounts) {
  $tests += Test-Api "auth_me" $u "GET" "/api/auth/me"
}

foreach ($u in @("hr", "employee", "admin")) {
  $tests += Test-Api "global_search" $u "GET" "/api/search?q=hr"
}

$exportCases = @(
  @("hr", "employees", "csv"),
  @("hr", "employees", "xlsx"),
  @("hr", "employees", "pdf"),
  @("hr", "attendance", "csv"),
  @("hr", "evaluations", "csv"),
  @("payroll", "payroll", "xlsx"),
  @("payroll", "payroll", "pdf"),
  @("recruiter", "recruitment", "csv"),
  @("manager", "employees", "csv"),
  @("employee", "attendance", "csv"),
  @("employee", "payroll", "csv"),
  @("recruiter", "payroll", "csv"),
  @("admin", "employees", "csv")
)

foreach ($c in $exportCases) {
  $tests += Test-Api "production_export" $c[0] "GET" "/api/production/exports/$($c[1])?format=$($c[2])"
}

foreach ($u in $accounts) {
  $tests += Test-Api "payroll_summary_rbac" $u "GET" "/api/reports/payroll-summary"
}

foreach ($path in @(
  "/api/document-reporting/dashboard",
  "/api/performance/dashboard",
  "/api/payroll-attendance/dashboard",
  "/api/recruitment/dashboard",
  "/api/job-profiles?page=1&pageSize=5"
)) {
  $tests += Test-Api "enterprise_regression" "hr" "GET" $path
}

[PSCustomObject]@{
  timestamp = (Get-Date).ToString("o")
  logins = $loginResults
  tests = $tests
} | ConvertTo-Json -Depth 8
