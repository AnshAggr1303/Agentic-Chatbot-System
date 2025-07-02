terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    supabase = {
      source  = "supabase/supabase"
      version = "~> 1.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# Lambda functions for processing layer
module "lambda_functions" {
  source = "./modules/aws-lambda"
  
  supabase_url = var.supabase_url
  supabase_key = var.supabase_service_key
}

# Storage configuration
module "storage" {
  source = "./modules/storage"
  
  environment = var.environment
}

# Monitoring and logging
resource "aws_cloudwatch_log_group" "chatbot_logs" {
  name              = "/aws/lambda/chatbot-system"
  retention_in_days = 14
}
