# Frontend Management Script for Optimizer Framework
# Usage: .\frontend.ps1 [command]
# Commands: start, stop, restart, logs, build, clean

param(
    [Parameter(Position=0)]
    [ValidateSet('start', 'stop', 'restart', 'logs', 'build', 'clean', 'status')]
    [string]$Command = 'start',
    
    [Parameter()]
    [string]$EnvFile = '.env.frontend.local'
)

$ComposeFile = "docker-compose.frontend.yml"
$NetworkName = "optimizer_network"

function Write-ColorOutput($ForegroundColor) {
    $fc = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    if ($args) {
        Write-Output $args
    }
    $host.UI.RawUI.ForegroundColor = $fc
}

function Ensure-Network {
    Write-ColorOutput Yellow "Checking Docker network..."
    $networkExists = docker network ls --format "{{.Name}}" | Select-String -Pattern "^$NetworkName$"
    
    if (-not $networkExists) {
        Write-ColorOutput Yellow "Creating network: $NetworkName"
        docker network create $NetworkName
    } else {
        Write-ColorOutput Green "Network $NetworkName exists"
    }
}

function Ensure-EnvFile {
    if (-not (Test-Path $EnvFile)) {
        Write-ColorOutput Yellow "Environment file not found. Creating from template..."
        Copy-Item ".env.frontend" $EnvFile
        Write-ColorOutput Yellow "Please edit $EnvFile with your configuration"
        return $false
    }
    return $true
}

switch ($Command) {
    'start' {
        Write-ColorOutput Cyan "Starting Frontend..."
        Ensure-Network
        if (Ensure-EnvFile) {
            docker-compose -f $ComposeFile --env-file $EnvFile up -d
            Write-ColorOutput Green "Frontend started successfully!"
            Write-ColorOutput Cyan "Access at: http://localhost"
        }
    }
    
    'stop' {
        Write-ColorOutput Cyan "Stopping Frontend..."
        docker-compose -f $ComposeFile down
        Write-ColorOutput Green "Frontend stopped"
    }
    
    'restart' {
        Write-ColorOutput Cyan "Restarting Frontend..."
        docker-compose -f $ComposeFile down
        Start-Sleep -Seconds 2
        Ensure-Network
        docker-compose -f $ComposeFile --env-file $EnvFile up -d
        Write-ColorOutput Green "Frontend restarted"
    }
    
    'logs' {
        Write-ColorOutput Cyan "Showing Frontend logs (Ctrl+C to exit)..."
        docker-compose -f $ComposeFile logs -f
    }
    
    'build' {
        Write-ColorOutput Cyan "Building Frontend..."
        docker-compose -f $ComposeFile build --no-cache
        Write-ColorOutput Green "Build complete"
    }
    
    'clean' {
        Write-ColorOutput Yellow "Cleaning up Frontend containers and images..."
        docker-compose -f $ComposeFile down --rmi all -v
        Write-ColorOutput Green "Cleanup complete"
    }
    
    'status' {
        Write-ColorOutput Cyan "Frontend Status:"
        docker-compose -f $ComposeFile ps
        Write-ColorOutput Cyan "`nHealth Status:"
        docker inspect optimizer_frontend_nginx --format='{{.State.Health.Status}}' 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-ColorOutput Yellow "Container not running"
        }
    }
}
