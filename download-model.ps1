$ErrorActionPreference = 'Stop'
$destination = Join-Path $PSScriptRoot 'public\models\CarConcept.glb'
New-Item -ItemType Directory -Force -Path (Split-Path $destination) | Out-Null
$url = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CarConcept/GLB/CarConcept.glb'
Write-Host 'Downloading official Khronos 3D model (~10 MB)...'
Invoke-WebRequest -Uri $url -OutFile $destination
Write-Host "Saved: $destination"
