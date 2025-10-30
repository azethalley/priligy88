# Dokploy Deployment Guide

This guide explains how to deploy this monorepo project (PayloadCMS app and Astro website) to Dokploy.

## Project Structure

This is a Turborepo monorepo with two applications:
- **payload_app**: Next.js application with PayloadCMS (Backend/CMS)
- **website**: Astro SSR website (Frontend)

Both applications need to be deployed as separate services in Dokploy.

---

## Prerequisites

1. **Dokploy installed** on your server
   ```bash
   curl -sSL https://dokploy.com/install.sh | sh
   ```

2. **PostgreSQL database** (PayloadCMS uses PostgreSQL)
   - You can deploy a PostgreSQL service in Dokploy or use an external database

3. **Environment variables** ready for both applications

---

## Deployment Options

Dokploy supports multiple build types. This project supports both:

### Option 1: Using Nixpacks (Recommended - Easiest)

Nixpacks is Dokploy's default build type. The project includes a `nixpacks.toml` configuration that handles both apps.

#### For PayloadCMS App:
1. Create a new **Project** in Dokploy
2. Add a new **Application** service
3. Connect your Git repository
4. Set build type to **Nixpacks**
5. Set environment variable: `SERVICE_TYPE=payload_app`
6. Configure these environment variables:
   ```
   DATABASE_URI=postgresql://user:password@host:5432/dbname
   PAYLOAD_SECRET=your-secret-key-here
   PORT=3000
   ```
7. Set the **Port** to `3000`
8. Deploy

#### For Website App:
1. In the same **Project**, add another **Application** service
2. Connect the same Git repository
3. Set build type to **Nixpacks**
4. Set environment variable: `SERVICE_TYPE=website`
5. Configure these environment variables:
   ```
   DATABASE_URI=postgresql://user:password@host:5432/dbname
   PAYLOAD_SECRET=your-secret-key-here
   PUBLIC_PAYLOAD_SERVER_URL=http://payload-app-url:3000
   PORT=4321
   ```
   (Replace `payload-app-url` with your PayloadCMS app's URL)
6. Set the **Port** to `4321`
7. Deploy

---

### Option 2: Using Dockerfile

This project includes optimized Dockerfiles for monorepo deployment.

#### For PayloadCMS App:
1. Create a new **Project** in Dokploy
2. Add a new **Application** service
3. Connect your Git repository
4. Set build type to **Dockerfile**
5. Set **Dockerfile Path** to: `Dockerfile.payload_app`
6. Configure environment variables (same as Nixpacks option)
7. Set the **Port** to `3000`
8. Deploy

#### For Website App:
1. In the same **Project**, add another **Application** service
2. Connect the same Git repository
3. Set build type to **Dockerfile**
4. Set **Dockerfile Path** to: `Dockerfile.website`
5. Configure environment variables (same as Nixpacks option)
6. Set the **Port** to `4321`
7. Deploy

---

## Required Environment Variables

### PayloadCMS App (`payload_app`)

```bash
# Database
DATABASE_URI=postgresql://user:password@host:5432/dbname

# PayloadCMS
PAYLOAD_SECRET=your-strong-secret-key-minimum-32-characters

# Server
PORT=3000
NODE_ENV=production
```

**Optional:**
```bash
# Upload Storage (if using UploadThing)
UPLOADTHING_TOKEN=your-token

# Admin email
ADMIN_EMAIL=admin@example.com
```

### Website App (`website`)

```bash
# Database
DATABASE_URI=postgresql://user:password@host:5432/dbname

# PayloadCMS
PAYLOAD_SECRET=your-strong-secret-key-minimum-32-characters

# PayloadCMS API URL
PUBLIC_PAYLOAD_SERVER_URL=http://payload-app-service-name:3000
# Or if using custom domain:
# PUBLIC_PAYLOAD_SERVER_URL=https://api.yourdomain.com

# Server
PORT=4321
NODE_ENV=production
```

**Optional:**
```bash
# Email (if configured)
ZOHO_EMAIL=your-email@zoho.com
ZOHO_PASSWORD=your-password
ADMIN_EMAIL=admin@example.com
```

---

## Database Setup

### Option A: Deploy PostgreSQL in Dokploy
1. In your Dokploy project, add a **Database** service
2. Select **PostgreSQL**
3. Configure username, password, and database name
4. Use the connection string in your applications' `DATABASE_URI`

### Option B: Use External PostgreSQL
- Use your existing PostgreSQL connection string
- Ensure both applications can access the database

---

## Auto-Deployment

Dokploy supports automatic deployments via webhooks:

### For GitHub:
- Auto-deployment is enabled by default when you connect a GitHub repository
- Pushing to the configured branch will automatically trigger a rebuild

### For Other Git Providers:
1. Enable **Auto Deploy** in your application's settings
2. Copy the webhook URL from deployment logs
3. Add the webhook URL to your repository settings (GitLab, Bitbucket, etc.)
4. Ensure the branch in Dokploy matches your push branch

---

## Networking & Service Communication

Since both applications are in the same Dokploy project:
- Services can communicate using their service names as hostnames
- Example: If your PayloadCMS service is named `payload-app`, the website can connect using: `http://payload-app:3000`
- For public access, configure domains in Dokploy for each service

---

## Domain Configuration

1. Add a **Domain** to each application in Dokploy
2. Configure DNS records to point to your Dokploy server
3. Configure SSL/TLS certificates (Dokploy can handle Let's Encrypt automatically)

---

## Troubleshooting

### Build Failures
- Check that `pnpm-lock.yaml` is committed to the repository
- Verify all environment variables are set correctly
- Check build logs in Dokploy dashboard

### Database Connection Issues
- Verify `DATABASE_URI` is correct
- Ensure the database service is running and accessible
- Check network connectivity between services

### Application Won't Start
- Verify `PORT` environment variable matches the configured port
- Check application logs in Dokploy
- Ensure `PAYLOAD_SECRET` is set (minimum 32 characters)

### Service Communication Issues
- Use service names (not localhost) for inter-service communication
- Verify both services are in the same Dokploy project
- Check network policies if services can't communicate

---

## Recommended Deployment Order

1. **Deploy PostgreSQL database** (if using Dokploy database service)
2. **Deploy PayloadCMS app** first (payload_app)
3. **Wait for PayloadCMS to be healthy** and accessible
4. **Deploy Website app** (website) with correct `PUBLIC_PAYLOAD_SERVER_URL`
5. **Verify both services** are running and communicating

---

## Additional Resources

- [Dokploy Documentation](https://docs.dokploy.com)
- [PayloadCMS Documentation](https://payloadcms.com/docs)
- [Astro Documentation](https://docs.astro.build)

