# Hush app — Makefile
# Thin wrapper over the pnpm scripts in package.json.
# Run `make help` to list available targets.

.DEFAULT_GOAL := help
.PHONY: help install start dev-client ios android typecheck lint check gen-api clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies (pnpm)
	pnpm install

start: ## Start the Metro bundler (Expo Go)
	pnpm start

dev-client: ## Start Metro against a Dev Client build (required for BLE, phase 3+)
	pnpm expo start --dev-client

ios: ## Native build + run on iOS simulator
	pnpm run ios

android: ## Native build + run on Android emulator
	pnpm run android

typecheck: ## Type-check with tsc --noEmit
	pnpm run typecheck

lint: ## Lint with expo lint
	pnpm run lint

check: typecheck lint ## Run typecheck + lint

gen-api: ## Regenerate the API client from hush-protocol/hush-api.yaml
	pnpm gen:api

clean: ## Remove node_modules and Expo/Metro caches
	rm -rf node_modules .expo
