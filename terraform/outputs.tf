output "service_uri" {
  description = "The Cloud Run service URL."
  value       = google_cloud_run_v2_service.server.uri
}

output "runtime_service_account" {
  description = "Runtime identity email."
  value       = google_service_account.runtime.email
}
