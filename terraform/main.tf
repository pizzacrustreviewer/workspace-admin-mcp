# Optional: deploy the server to Cloud Run. This is reference IaC — it does NOT
# run unless you `terraform apply` against a project you own. Never point it at
# production/corporate infrastructure.

terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# Dedicated least-privilege runtime identity for the service.
resource "google_service_account" "runtime" {
  account_id   = "workspace-admin-mcp"
  display_name = "Workspace Admin MCP – Cloud Run runtime"
}

resource "google_cloud_run_v2_service" "server" {
  name     = "workspace-admin-mcp"
  location = var.region

  # Keep it off the public internet; front with IAP or an internal LB.
  ingress = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"

  template {
    service_account = google_service_account.runtime.email

    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }

    containers {
      image = var.image

      ports {
        container_port = 8080
      }

      env {
        name  = "MCP_TRANSPORT"
        value = "streamable-http"
      }
      env {
        name  = "WORKSPACE_READ_ONLY"
        value = "true"
      }
      env {
        name  = "WORKSPACE_ADMIN_SUBJECT"
        value = var.admin_subject
      }
      env {
        name  = "GOOGLE_APPLICATION_CREDENTIALS"
        value = "/secrets/sa/key.json"
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      volume_mounts {
        name       = "sa-key"
        mount_path = "/secrets/sa"
      }
    }

    # The DWD service-account key is created out-of-band and stored in Secret
    # Manager; Terraform only references it, never creates the secret material.
    volumes {
      name = "sa-key"
      secret {
        secret = var.sa_key_secret_id
        items {
          version = "latest"
          path    = "key.json"
        }
      }
    }
  }
}
