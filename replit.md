# Reivilo B2B Portal (Cin7-integrated)

## Overview
Production-ready B2B portal that integrates with Cin7 Core (DEAR) via API. Provides multi-warehouse stock visibility, pricing management, and order processing with local Postgres caching.

## Project Architecture
- **Backend**: Node.js with Express, integrates with Cin7 Core API
- **Frontend**: React with Vite
- **Database**: PostgreSQL (local cache, Cin7 as system of record)
- **Deployment**: Replit (Reserved VM for production)

## Key Features
- Multi-warehouse stock visibility (Available, On Hand, On Order)
- Customer-specific pricing (price tiers)
- Cart and checkout functionality
- Order push to Cin7 as Quotes (NOTAUTHORISED status)
- Local caching for speed and resilience

## Recent Changes
- Complete Reivilo branding integration with royal blue color scheme
- Currency standardized to South African Rand (ZAR) throughout system
- Landing page updated to hide Cin7 references from customers
- Multi-warehouse inventory messaging focused on Reivilo locations
- Customer-specific pricing section removed per customer-facing requirements

## User Preferences
- Follow the specified folder structure
- Keep Cin7 as system of record with local caching
- Use production-ready patterns and error handling