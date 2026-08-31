terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

provider "aws" { region = var.region }

variable "region" { type = string; default = "us-east-1" }
variable "app_name" { type = string; default = "bta" }

resource "aws_db_instance" "postgres" {
  identifier     = "${var.app_name}-pg"
  engine         = "postgres"
  engine_version = "15"
  instance_class = "db.t4g.medium"
  allocated_storage = 100
  storage_encrypted = true
  backup_retention_period = 7
  deletion_protection = true
  tags = { Name = "${var.app_name}-pg" }
}

resource "aws_s3_bucket" "storage" {
  bucket = "${var.app_name}-storage-${var.region}"
  tags   = { Name = "${var.app_name}-storage" }
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "${var.app_name}-redis"
  description          = "BullMQ queue + cache"
  engine               = "redis"
  node_type            = "cache.t4g.micro"
  num_cache_clusters   = 2
}

output "db_endpoint" { value = aws_db_instance.postgres.endpoint }
output "s3_bucket" { value = aws_s3_bucket.storage.bucket }
