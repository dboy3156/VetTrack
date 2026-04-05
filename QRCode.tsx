kind = "web"
previewPath = "/"
title = "Equipment Tracker"
version = "1.0.0"
id = "artifacts/equipment-tracker"
router = "path"

[[integratedSkills]]
name = "react-vite"
version = "1.0.0"

[[services]]
name = "web"
paths = [ "/" ]
localPort = 24018

[services.development]
run = "pnpm --filter @workspace/equipment-tracker run dev"

[services.production]
build = [ "pnpm", "--filter", "@workspace/equipment-tracker", "run", "build" ]
publicDir = "artifacts/equipment-tracker/dist/public"
serve = "static"

[[services.production.rewrites]]
from = "/*"
to = "/index.html"

[services.env]
PORT = "24018"
BASE_PATH = "/"
