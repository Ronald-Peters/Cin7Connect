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
- Fixed deployment issues with TypeScript errors and package-lock.json files
- Implemented API rate limiting protection with 5-minute caching
- **PRODUCTION READY**: Admin authentication system integrated with role-based access control
- Admin portal fully operational with customer management and client user creation
- Public registration disabled - all client access controlled through admin interface
- Two admin users configured: ronald@reiviloindustrial.co.za and sales2@reiviloindustrial.co.za

## APPROVED FINAL LAYOUTS - DO NOT MODIFY
### Home Page Layout (/) - LOCKED
- **Route**: `/` (root page)
- **Layout**: Full-page demo interface with Reivilo branding
- **Header**: Royal blue (#1E3A8A) header with company logo and 45-year heritage message
- **Styling**: Gradient background (royal blue to light blue), professional card-based design
- **Content**: Welcome message, company values, navigation to catalog and test interfaces
- **Colors**: --reivilo-purple: #1E3A8A, --reivilo-light: #DBEAFE, --reivilo-dark: #1E40AF
- **Typography**: 'Segoe UI' font family with proper hierarchy
- **Status**: ✅ APPROVED - Layout may not be changed

### Product Catalog Layout (/catalog) - LOCKED  
- **Route**: `/catalog` 
- **Layout**: Full catalog interface with live Cin7 data integration
- **Header**: White header with royal blue border, search functionality
- **Stats Bar**: Shows product count, warehouse regions, ZAR currency
- **Product Grid**: Card-based layout with product images, pricing, stock levels
- **Warehouse Integration**: JHB, CPT, BFN stock breakdown per product
- **Cart Functionality**: Add to cart buttons, warehouse selection dropdowns
- **Search**: Real-time product search with filtering
- **Colors**: Same Reivilo color scheme as home page
- **Typography**: 'Segoe UI' with consistent styling
- **Status**: ✅ APPROVED - Layout may not be changed

## User Preferences
- Follow the specified folder structure
- Keep Cin7 as system of record with local caching
- Use production-ready patterns and error handling
- **CRITICAL**: Home page (/) and catalog page (/catalog) layouts are LOCKED and may not be modified regardless of future enhancements

## Production Deployment Status
- ✅ **READY FOR GO-LIVE**: All core functionality implemented and tested
- ✅ Admin authentication system with specific credentials configured
- ✅ Role-based access control enforcing admin-only client creation
- ✅ Cin7 Core API integration with real-time inventory and pricing data
- ✅ Multi-warehouse stock visibility across JHB, CPT, BFN locations
- ✅ Cart functionality with quote generation to Cin7 as UNAUTHORISED status
- ✅ Production build configuration with proper asset serving
- ✅ Database schema optimized for production workloads
- ✅ Error handling and logging implemented throughout system
- ✅ Admin portal integrated into main navigation for authorized users

## Admin Credentials (Production)
- ronald@reiviloindustrial.co.za (Password: Ron@Reiv25) - Primary Administrator
- sales2@reiviloindustrial.co.za (Password: Kai@Reiv25) - Sales Administrator

## Go-Live Checklist Completed
- [x] Admin authentication system operational
- [x] Client access management through admin interface
- [x] Cin7 integration with live product catalog (614 SKUs)
- [x] Multi-warehouse inventory display (JHB, CPT, BFN)
- [x] Customer-specific pricing implementation
- [x] Cart and quote generation functionality
- [x] Production build and deployment configuration
- [x] Database schema with admin roles and customer activation
- [x] Error handling and production logging
- [x] Security measures and role-based access control