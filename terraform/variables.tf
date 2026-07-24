variable "project_id" {
  type        = string
  description = "A GCP project you own (e.g. a personal sandbox). Never a corporate project."
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "image" {
  type        = string
  description = "Container image, e.g. us-central1-docker.pkg.dev/PROJECT/repo/workspace-admin-mcp:latest"
}

variable "admin_subject" {
  type        = string
  description = "Admin user the service account impersonates via domain-wide delegation."
}

variable "sa_key_secret_id" {
  type        = string
  description = "Secret Manager secret id holding the DWD service-account key JSON."
}
