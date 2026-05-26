export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agency_bank_accounts: {
        Row: {
          account_type: string
          bank_name: string
          id: string
          institution_logo: string | null
          linked_at: string
          linked_by: string | null
          mask: string
          organization_id: string
          plaid_account_id: string | null
        }
        Insert: {
          account_type: string
          bank_name: string
          id?: string
          institution_logo?: string | null
          linked_at?: string
          linked_by?: string | null
          mask: string
          organization_id: string
          plaid_account_id?: string | null
        }
        Update: {
          account_type?: string
          bank_name?: string
          id?: string
          institution_logo?: string | null
          linked_at?: string
          linked_by?: string | null
          mask?: string
          organization_id?: string
          plaid_account_id?: string | null
        }
        Relationships: []
      }
      agency_bank_mappings: {
        Row: {
          bank_account_id: string
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
        }
        Insert: {
          bank_account_id: string
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
        }
        Update: {
          bank_account_id?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_bank_mappings_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: true
            referencedRelation: "agency_bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      certification_types: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_global: boolean
          name: string
          organization_id: string | null
          requires_upload: boolean
          track_id: string | null
          validity_months: number | null
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_global?: boolean
          name: string
          organization_id?: string | null
          requires_upload?: boolean
          track_id?: string | null
          validity_months?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_global?: boolean
          name?: string
          organization_id?: string | null
          requires_upload?: boolean
          track_id?: string | null
          validity_months?: number | null
        }
        Relationships: []
      }
      certifications: {
        Row: {
          course_id: string
          course_title: string | null
          created_at: string
          expires_at: string | null
          id: string
          issued_at: string
          organization_id: string
          recipient_name: string | null
          user_id: string
          verification_code: string
        }
        Insert: {
          course_id: string
          course_title?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          issued_at?: string
          organization_id: string
          recipient_name?: string | null
          user_id: string
          verification_code?: string
        }
        Update: {
          course_id?: string
          course_title?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          issued_at?: string
          organization_id?: string
          recipient_name?: string | null
          user_id?: string
          verification_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "certifications_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_belongings: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          description: string | null
          discard_reason: string | null
          discarded_on: string | null
          estimated_value: number
          guardian_signature_data_url: string | null
          id: string
          inventoried_by: string | null
          inventoried_by_name: string | null
          inventoried_on: string
          item_name: string
          organization_id: string
          signed_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discard_reason?: string | null
          discarded_on?: string | null
          estimated_value?: number
          guardian_signature_data_url?: string | null
          id?: string
          inventoried_by?: string | null
          inventoried_by_name?: string | null
          inventoried_on?: string
          item_name: string
          organization_id: string
          signed_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          discard_reason?: string | null
          discarded_on?: string | null
          estimated_value?: number
          guardian_signature_data_url?: string | null
          id?: string
          inventoried_by?: string | null
          inventoried_by_name?: string | null
          inventoried_on?: string
          item_name?: string
          organization_id?: string
          signed_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      client_medications: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          discontinued_at: string | null
          discontinued_by: string | null
          dosage: string | null
          end_date: string | null
          frequency: string | null
          id: string
          instructions: string | null
          is_active: boolean
          medication_name: string
          organization_id: string
          prescriber: string | null
          route: string | null
          scheduled_times: string[]
          start_date: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          discontinued_at?: string | null
          discontinued_by?: string | null
          dosage?: string | null
          end_date?: string | null
          frequency?: string | null
          id?: string
          instructions?: string | null
          is_active?: boolean
          medication_name: string
          organization_id: string
          prescriber?: string | null
          route?: string | null
          scheduled_times?: string[]
          start_date?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          discontinued_at?: string | null
          discontinued_by?: string | null
          dosage?: string | null
          end_date?: string | null
          frequency?: string | null
          id?: string
          instructions?: string | null
          is_active?: boolean
          medication_name?: string
          organization_id?: string
          prescriber?: string | null
          route?: string | null
          scheduled_times?: string[]
          start_date?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          account_status: string
          authorized_dspd_codes: string[]
          created_at: string
          first_name: string
          geofence_radius_feet: number
          home_latitude: number | null
          home_longitude: number | null
          id: string
          job_code: string[]
          last_name: string
          medicaid_id: string | null
          organization_id: string
          pcsp_goals: string[]
          phone_number: string | null
          physical_address: string | null
          team_id: string | null
        }
        Insert: {
          account_status?: string
          authorized_dspd_codes?: string[]
          created_at?: string
          first_name: string
          geofence_radius_feet?: number
          home_latitude?: number | null
          home_longitude?: number | null
          id?: string
          job_code?: string[]
          last_name: string
          medicaid_id?: string | null
          organization_id: string
          pcsp_goals?: string[]
          phone_number?: string | null
          physical_address?: string | null
          team_id?: string | null
        }
        Update: {
          account_status?: string
          authorized_dspd_codes?: string[]
          created_at?: string
          first_name?: string
          geofence_radius_feet?: number
          home_latitude?: number | null
          home_longitude?: number | null
          id?: string
          job_code?: string[]
          last_name?: string
          medicaid_id?: string | null
          organization_id?: string
          pcsp_goals?: string[]
          phone_number?: string | null
          physical_address?: string | null
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          gap_key: string
          gap_reference_date: string
          gap_type: string
          id: string
          organization_id: string
          reason: string
          staff_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          gap_key: string
          gap_reference_date: string
          gap_type: string
          id?: string
          organization_id: string
          reason: string
          staff_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          gap_key?: string
          gap_reference_date?: string
          gap_type?: string
          id?: string
          organization_id?: string
          reason?: string
          staff_id?: string
        }
        Relationships: []
      }
      course_assignments: {
        Row: {
          assigned_by: string | null
          completed_at: string | null
          course_id: string
          created_at: string
          due_date: string | null
          id: string
          organization_id: string
          progress: number
          status: Database["public"]["Enums"]["assignment_status"]
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          completed_at?: string | null
          course_id: string
          created_at?: string
          due_date?: string | null
          id?: string
          organization_id: string
          progress?: number
          status?: Database["public"]["Enums"]["assignment_status"]
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          completed_at?: string | null
          course_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          organization_id?: string
          progress?: number
          status?: Database["public"]["Enums"]["assignment_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      course_modules: {
        Row: {
          body: string | null
          course_id: string
          created_at: string
          id: string
          order_index: number
          pdf_url: string | null
          quiz: Json | null
          title: string
          video_url: string | null
        }
        Insert: {
          body?: string | null
          course_id: string
          created_at?: string
          id?: string
          order_index?: number
          pdf_url?: string | null
          quiz?: Json | null
          title: string
          video_url?: string | null
        }
        Update: {
          body?: string | null
          course_id?: string
          created_at?: string
          id?: string
          order_index?: number
          pdf_url?: string | null
          quiz?: Json | null
          title?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_modules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          category: string | null
          certificate_validity_months: number | null
          cover_url: string | null
          created_at: string
          created_by: string | null
          description: string | null
          duration_minutes: number | null
          id: string
          is_global: boolean
          is_published: boolean
          organization_id: string | null
          title: string
        }
        Insert: {
          category?: string | null
          certificate_validity_months?: number | null
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_global?: boolean
          is_published?: boolean
          organization_id?: string | null
          title: string
        }
        Update: {
          category?: string | null
          certificate_validity_months?: number | null
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_global?: boolean
          is_published?: boolean
          organization_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_field_definitions: {
        Row: {
          created_at: string
          created_by: string | null
          data_type: string
          entity_kind: string
          field_key: string
          field_label: string
          id: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data_type: string
          entity_kind: string
          field_key: string
          field_label: string
          id?: string
          organization_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data_type?: string
          entity_kind?: string
          field_key?: string
          field_label?: string
          id?: string
          organization_id?: string
        }
        Relationships: []
      }
      custom_field_values: {
        Row: {
          created_at: string
          definition_id: string
          entity_id: string
          entity_kind: string
          id: string
          organization_id: string
          updated_at: string
          value_boolean: boolean | null
          value_date: string | null
          value_number: number | null
          value_text: string | null
        }
        Insert: {
          created_at?: string
          definition_id: string
          entity_id: string
          entity_kind: string
          id?: string
          organization_id: string
          updated_at?: string
          value_boolean?: boolean | null
          value_date?: string | null
          value_number?: number | null
          value_text?: string | null
        }
        Update: {
          created_at?: string
          definition_id?: string
          entity_id?: string
          entity_kind?: string
          id?: string
          organization_id?: string
          updated_at?: string
          value_boolean?: boolean | null
          value_date?: string | null
          value_number?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_values_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "custom_field_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_logs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          client_id: string
          created_at: string
          id: string
          log_date: string
          narrative: string
          organization_id: string
          pcsp_goals_addressed: string[]
          signature_data_url: string | null
          status: string
          submitted_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          client_id: string
          created_at?: string
          id?: string
          log_date?: string
          narrative: string
          organization_id: string
          pcsp_goals_addressed?: string[]
          signature_data_url?: string | null
          status?: string
          submitted_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          client_id?: string
          created_at?: string
          id?: string
          log_date?: string
          narrative?: string
          organization_id?: string
          pcsp_goals_addressed?: string[]
          signature_data_url?: string | null
          status?: string
          submitted_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      els_usage_ledger: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          organization_id: string
          service_date: string
          units: number
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          service_date: string
          units: number
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          service_date?: string
          units?: number
        }
        Relationships: []
      }
      emar_logs: {
        Row: {
          administered_at: string | null
          client_id: string
          created_at: string
          exception_reason: string | null
          id: string
          medication_id: string
          notes: string | null
          organization_id: string
          scheduled_for: string
          scheduled_time_label: string | null
          signature_attestation: string | null
          staff_id: string | null
          staff_name: string | null
          status: string
        }
        Insert: {
          administered_at?: string | null
          client_id: string
          created_at?: string
          exception_reason?: string | null
          id?: string
          medication_id: string
          notes?: string | null
          organization_id: string
          scheduled_for: string
          scheduled_time_label?: string | null
          signature_attestation?: string | null
          staff_id?: string | null
          staff_name?: string | null
          status: string
        }
        Update: {
          administered_at?: string | null
          client_id?: string
          created_at?: string
          exception_reason?: string | null
          id?: string
          medication_id?: string
          notes?: string | null
          organization_id?: string
          scheduled_for?: string
          scheduled_time_label?: string | null
          signature_attestation?: string | null
          staff_id?: string | null
          staff_name?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "emar_logs_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "client_medications"
            referencedColumns: ["id"]
          },
        ]
      }
      evv_timesheets: {
        Row: {
          ai_coaching_iterations: number
          ai_compliance_feedback: string | null
          ai_compliance_status: string | null
          client_id: string
          clock_in_timestamp: string
          clock_out_timestamp: string | null
          created_at: string
          edit_audit_history_log: Json
          edited_by_admin_name: string | null
          goals_completed: Json
          gps_in_coordinates: Json
          gps_out_coordinates: Json | null
          id: string
          is_edited_by_admin: boolean
          organization_id: string
          outside_geofence_reason: string | null
          raw_clock_in: string | null
          raw_clock_out: string | null
          rounded_clock_in: string | null
          rounded_clock_out: string | null
          service_type_code: string
          shift_entry_type: string
          shift_note_text: string | null
          staff_id: string
          status: string
          tenant_id: string | null
          timesheet_embedding: string | null
          timezone_setting: string
          updated_at: string
          utah_medicaid_member_id: string
          utah_medicaid_provider_id: string
        }
        Insert: {
          ai_coaching_iterations?: number
          ai_compliance_feedback?: string | null
          ai_compliance_status?: string | null
          client_id: string
          clock_in_timestamp?: string
          clock_out_timestamp?: string | null
          created_at?: string
          edit_audit_history_log?: Json
          edited_by_admin_name?: string | null
          goals_completed?: Json
          gps_in_coordinates: Json
          gps_out_coordinates?: Json | null
          id?: string
          is_edited_by_admin?: boolean
          organization_id: string
          outside_geofence_reason?: string | null
          raw_clock_in?: string | null
          raw_clock_out?: string | null
          rounded_clock_in?: string | null
          rounded_clock_out?: string | null
          service_type_code: string
          shift_entry_type: string
          shift_note_text?: string | null
          staff_id: string
          status?: string
          tenant_id?: string | null
          timesheet_embedding?: string | null
          timezone_setting?: string
          updated_at?: string
          utah_medicaid_member_id: string
          utah_medicaid_provider_id: string
        }
        Update: {
          ai_coaching_iterations?: number
          ai_compliance_feedback?: string | null
          ai_compliance_status?: string | null
          client_id?: string
          clock_in_timestamp?: string
          clock_out_timestamp?: string | null
          created_at?: string
          edit_audit_history_log?: Json
          edited_by_admin_name?: string | null
          goals_completed?: Json
          gps_in_coordinates?: Json
          gps_out_coordinates?: Json | null
          id?: string
          is_edited_by_admin?: boolean
          organization_id?: string
          outside_geofence_reason?: string | null
          raw_clock_in?: string | null
          raw_clock_out?: string | null
          rounded_clock_in?: string | null
          rounded_clock_out?: string | null
          service_type_code?: string
          shift_entry_type?: string
          shift_note_text?: string | null
          staff_id?: string
          status?: string
          tenant_id?: string | null
          timesheet_embedding?: string | null
          timezone_setting?: string
          updated_at?: string
          utah_medicaid_member_id?: string
          utah_medicaid_provider_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evv_timesheets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evv_timesheets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "provider_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      external_certifications: {
        Row: {
          cert_name: string | null
          cert_type: string
          certification_type_id: string | null
          created_at: string
          expires_at: string | null
          file_url: string | null
          id: string
          issued_date: string | null
          issuer: string | null
          organization_id: string
          renewal_reminder_sent_at: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          reviewer_notes: string | null
          status: Database["public"]["Enums"]["external_cert_status"]
          user_id: string
        }
        Insert: {
          cert_name?: string | null
          cert_type: string
          certification_type_id?: string | null
          created_at?: string
          expires_at?: string | null
          file_url?: string | null
          id?: string
          issued_date?: string | null
          issuer?: string | null
          organization_id: string
          renewal_reminder_sent_at?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_notes?: string | null
          status?: Database["public"]["Enums"]["external_cert_status"]
          user_id: string
        }
        Update: {
          cert_name?: string | null
          cert_type?: string
          certification_type_id?: string | null
          created_at?: string
          expires_at?: string | null
          file_url?: string | null
          id?: string
          issued_date?: string | null
          issuer?: string | null
          organization_id?: string
          renewal_reminder_sent_at?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_notes?: string | null
          status?: Database["public"]["Enums"]["external_cert_status"]
          user_id?: string
        }
        Relationships: []
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["invitation_status"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_progress: {
        Row: {
          assignment_id: string | null
          completed: boolean
          completed_at: string
          id: string
          lesson_id: string
          user_id: string
        }
        Insert: {
          assignment_id?: string | null
          completed?: boolean
          completed_at?: string
          id?: string
          lesson_id: string
          user_id: string
        }
        Update: {
          assignment_id?: string | null
          completed?: boolean
          completed_at?: string
          id?: string
          lesson_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_progress_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "course_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_quiz_attempts: {
        Row: {
          answers: Json
          created_at: string
          id: string
          lesson_id: string
          passed: boolean
          score: number
          total: number
          user_id: string
        }
        Insert: {
          answers?: Json
          created_at?: string
          id?: string
          lesson_id: string
          passed?: boolean
          score?: number
          total?: number
          user_id: string
        }
        Update: {
          answers?: Json
          created_at?: string
          id?: string
          lesson_id?: string
          passed?: boolean
          score?: number
          total?: number
          user_id?: string
        }
        Relationships: []
      }
      lessons: {
        Row: {
          content: string | null
          created_at: string
          data: Json
          duration_minutes: number | null
          id: string
          lesson_type: string
          module_id: string
          order_index: number
          pdf_url: string | null
          required: boolean
          title: string
          video_url: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          data?: Json
          duration_minutes?: number | null
          id?: string
          lesson_type?: string
          module_id: string
          order_index?: number
          pdf_url?: string | null
          required?: boolean
          title: string
          video_url?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          data?: Json
          duration_minutes?: number | null
          id?: string
          lesson_type?: string
          module_id?: string
          order_index?: number
          pdf_url?: string | null
          required?: boolean
          title?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "course_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      module_progress: {
        Row: {
          assignment_id: string
          completed: boolean
          completed_at: string | null
          id: string
          module_id: string
          quiz_score: number | null
          user_id: string
        }
        Insert: {
          assignment_id: string
          completed?: boolean
          completed_at?: string | null
          id?: string
          module_id: string
          quiz_score?: number | null
          user_id: string
        }
        Update: {
          assignment_id?: string
          completed?: boolean
          completed_at?: string | null
          id?: string
          module_id?: string
          quiz_score?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_progress_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "course_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "module_progress_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "course_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          active: boolean
          created_at: string
          id: string
          job_title: string | null
          manager_id: string | null
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          job_title?: string | null
          manager_id?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          job_title?: string | null
          manager_id?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "organization_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          logo_url: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      pba_accounts: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          current_balance: number
          id: string
          medicaid_threshold: number
          notes: string | null
          opened_on: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          current_balance?: number
          id?: string
          medicaid_threshold?: number
          notes?: string | null
          opened_on?: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          current_balance?: number
          id?: string
          medicaid_threshold?: number
          notes?: string | null
          opened_on?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      pba_audit_samples: {
        Row: {
          account_id: string
          assigned_auditor: string | null
          created_at: string
          id: string
          organization_id: string
          quarter: string
          status: string
          verified_at: string | null
          verifier_notes: string | null
        }
        Insert: {
          account_id: string
          assigned_auditor?: string | null
          created_at?: string
          id?: string
          organization_id: string
          quarter: string
          status?: string
          verified_at?: string | null
          verifier_notes?: string | null
        }
        Update: {
          account_id?: string
          assigned_auditor?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          quarter?: string
          status?: string
          verified_at?: string | null
          verifier_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pba_audit_samples_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "pba_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      pba_transactions: {
        Row: {
          account_id: string
          amount: number
          auto_reconciled: boolean
          counterparty: string | null
          created_at: string
          created_by: string | null
          id: string
          memo: string | null
          occurred_on: string
          organization_id: string
          receipt_url: string | null
          source: string | null
          txn_type: string
        }
        Insert: {
          account_id: string
          amount: number
          auto_reconciled?: boolean
          counterparty?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          memo?: string | null
          occurred_on?: string
          organization_id: string
          receipt_url?: string | null
          source?: string | null
          txn_type: string
        }
        Update: {
          account_id?: string
          amount?: number
          auto_reconciled?: boolean
          counterparty?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          memo?: string | null
          occurred_on?: string
          organization_id?: string
          receipt_url?: string | null
          source?: string | null
          txn_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "pba_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "pba_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_status: string
          agency_name: string | null
          created_at: string
          department: string | null
          email: string | null
          employee_id: string | null
          evv_consent_timestamp: string | null
          evv_gps_consent_status: string
          first_name: string | null
          full_name: string | null
          hire_date: string | null
          id: string
          is_active: boolean
          last_name: string | null
          must_change_password: boolean
          position: string | null
          system_role: string
          team_id: string | null
          tenant_id: string | null
          username: string | null
        }
        Insert: {
          account_status?: string
          agency_name?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          employee_id?: string | null
          evv_consent_timestamp?: string | null
          evv_gps_consent_status?: string
          first_name?: string | null
          full_name?: string | null
          hire_date?: string | null
          id: string
          is_active?: boolean
          last_name?: string | null
          must_change_password?: boolean
          position?: string | null
          system_role?: string
          team_id?: string | null
          tenant_id?: string | null
          username?: string | null
        }
        Update: {
          account_status?: string
          agency_name?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          employee_id?: string | null
          evv_consent_timestamp?: string | null
          evv_gps_consent_status?: string
          first_name?: string | null
          full_name?: string | null
          hire_date?: string | null
          id?: string
          is_active?: boolean
          last_name?: string | null
          must_change_password?: boolean
          position?: string | null
          system_role?: string
          team_id?: string | null
          tenant_id?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "provider_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      program_acknowledgements: {
        Row: {
          acknowledged_at: string
          course_id: string
          id: string
          program_assignment_id: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string
          course_id: string
          id?: string
          program_assignment_id: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string
          course_id?: string
          id?: string
          program_assignment_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_acknowledgements_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_acknowledgements_program_assignment_id_fkey"
            columns: ["program_assignment_id"]
            isOneToOne: false
            referencedRelation: "program_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      program_assignments: {
        Row: {
          assigned_by: string | null
          completed_at: string | null
          created_at: string
          due_date: string | null
          expires_at: string | null
          id: string
          organization_id: string
          program_id: string
          progress: number
          status: Database["public"]["Enums"]["assignment_status"]
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          expires_at?: string | null
          id?: string
          organization_id: string
          program_id: string
          progress?: number
          status?: Database["public"]["Enums"]["assignment_status"]
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          expires_at?: string | null
          id?: string
          organization_id?: string
          program_id?: string
          progress?: number
          status?: Database["public"]["Enums"]["assignment_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_assignments_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "training_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_courses: {
        Row: {
          course_id: string
          created_at: string
          id: string
          order_index: number
          program_id: string
          required: boolean
          unlock_after: string | null
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          order_index?: number
          program_id: string
          required?: boolean
          unlock_after?: string | null
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          order_index?: number
          program_id?: string
          required?: boolean
          unlock_after?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "program_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_courses_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "training_programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_courses_unlock_after_fkey"
            columns: ["unlock_after"]
            isOneToOne: false
            referencedRelation: "program_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_tenants: {
        Row: {
          agency_name: string
          client_tier_limit: number
          created_at: string
          feature_ai_receipt_ocr: boolean
          feature_lms_training: boolean
          feature_pba_bank_feed: boolean
          feature_quickbooks_sync: boolean
          id: string
          is_active: boolean
          owner_email: string
          updated_at: string
        }
        Insert: {
          agency_name: string
          client_tier_limit?: number
          created_at?: string
          feature_ai_receipt_ocr?: boolean
          feature_lms_training?: boolean
          feature_pba_bank_feed?: boolean
          feature_quickbooks_sync?: boolean
          id?: string
          is_active?: boolean
          owner_email: string
          updated_at?: string
        }
        Update: {
          agency_name?: string
          client_tier_limit?: number
          created_at?: string
          feature_ai_receipt_ocr?: boolean
          feature_lms_training?: boolean
          feature_pba_bank_feed?: boolean
          feature_quickbooks_sync?: boolean
          id?: string
          is_active?: boolean
          owner_email?: string
          updated_at?: string
        }
        Relationships: []
      }
      respite_stays: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string
          host_home_id: string
          id: string
          notes: string | null
          organization_id: string
          respite_client_id: string
          start_date: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date: string
          host_home_id: string
          id?: string
          notes?: string | null
          organization_id: string
          respite_client_id: string
          start_date: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string
          host_home_id?: string
          id?: string
          notes?: string | null
          organization_id?: string
          respite_client_id?: string
          start_date?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          enabled: boolean
          id: string
          organization_id: string
          permission: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          id?: string
          organization_id: string
          permission: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          id?: string
          organization_id?: string
          permission?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_assignments: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          is_group_home_assignment: boolean
          organization_id: string
          staff_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_group_home_assignment?: boolean
          organization_id: string
          staff_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_group_home_assignment?: boolean
          organization_id?: string
          staff_id?: string
        }
        Relationships: []
      }
      staff_certifications: {
        Row: {
          certification: string
          created_at: string
          expiration_date: string | null
          id: string
          issued_date: string | null
          role: string | null
          staff_name: string
          status: string
        }
        Insert: {
          certification: string
          created_at?: string
          expiration_date?: string | null
          id?: string
          issued_date?: string | null
          role?: string | null
          staff_name: string
          status?: string
        }
        Update: {
          certification?: string
          created_at?: string
          expiration_date?: string | null
          id?: string
          issued_date?: string | null
          role?: string | null
          staff_name?: string
          status?: string
        }
        Relationships: []
      }
      staff_nudges: {
        Row: {
          created_at: string
          created_by: string | null
          gap_key: string
          gap_reference_date: string | null
          gap_type: string
          id: string
          message: string
          organization_id: string
          priority: string
          read_at: string | null
          staff_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          gap_key: string
          gap_reference_date?: string | null
          gap_type: string
          id?: string
          message: string
          organization_id: string
          priority?: string
          read_at?: string | null
          staff_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          gap_key?: string
          gap_reference_date?: string | null
          gap_type?: string
          id?: string
          message?: string
          organization_id?: string
          priority?: string
          read_at?: string | null
          staff_id?: string
        }
        Relationships: []
      }
      submitted_forms: {
        Row: {
          attachment_url: string | null
          client_id: string
          created_at: string
          form_type: string
          id: string
          narrative: string | null
          occurred_at: string
          organization_id: string
          payload: Json
          title: string
          user_id: string
        }
        Insert: {
          attachment_url?: string | null
          client_id: string
          created_at?: string
          form_type: string
          id?: string
          narrative?: string | null
          occurred_at?: string
          organization_id: string
          payload?: Json
          title: string
          user_id: string
        }
        Update: {
          attachment_url?: string | null
          client_id?: string
          created_at?: string
          form_type?: string
          id?: string
          narrative?: string | null
          occurred_at?: string
          organization_id?: string
          payload?: Json
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      system_features: {
        Row: {
          category: string
          created_at: string
          feature_key: string
          feature_name: string
          id: string
          sort_order: number
        }
        Insert: {
          category?: string
          created_at?: string
          feature_key: string
          feature_name: string
          id?: string
          sort_order?: number
        }
        Update: {
          category?: string
          created_at?: string
          feature_key?: string
          feature_name?: string
          id?: string
          sort_order?: number
        }
        Relationships: []
      }
      teams: {
        Row: {
          created_at: string
          id: string
          manager_id: string | null
          organization_id: string | null
          team_name: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          manager_id?: string | null
          organization_id?: string | null
          team_name: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          manager_id?: string | null
          organization_id?: string | null
          team_name?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "provider_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_features: {
        Row: {
          feature_key: string
          id: string
          is_enabled: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          feature_key: string
          id?: string
          is_enabled?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          feature_key?: string
          id?: string
          is_enabled?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_features_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "system_features"
            referencedColumns: ["feature_key"]
          },
          {
            foreignKeyName: "tenant_features_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "provider_tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      track_assignments: {
        Row: {
          assigned_by: string | null
          completed_at: string | null
          created_at: string
          due_date: string | null
          expires_at: string | null
          id: string
          organization_id: string
          progress: number
          recurs_at: string | null
          status: Database["public"]["Enums"]["assignment_status"]
          track_id: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          expires_at?: string | null
          id?: string
          organization_id: string
          progress?: number
          recurs_at?: string | null
          status?: Database["public"]["Enums"]["assignment_status"]
          track_id: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          expires_at?: string | null
          id?: string
          organization_id?: string
          progress?: number
          recurs_at?: string | null
          status?: Database["public"]["Enums"]["assignment_status"]
          track_id?: string
          user_id?: string
        }
        Relationships: []
      }
      track_programs: {
        Row: {
          created_at: string
          id: string
          order_index: number
          program_id: string
          required: boolean
          track_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_index?: number
          program_id: string
          required?: boolean
          track_id: string
        }
        Update: {
          created_at?: string
          id?: string
          order_index?: number
          program_id?: string
          required?: boolean
          track_id?: string
        }
        Relationships: []
      }
      training_modules: {
        Row: {
          created_at: string
          description: string | null
          id: string
          mindsmith_url: string | null
          sequence_order: number
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          mindsmith_url?: string | null
          sequence_order: number
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          mindsmith_url?: string | null
          sequence_order?: number
          title?: string
        }
        Relationships: []
      }
      training_programs: {
        Row: {
          annual_renewal: boolean
          category: string | null
          cover_url: string | null
          created_at: string
          created_by: string | null
          description: string | null
          estimated_minutes: number | null
          id: string
          is_global: boolean
          is_published: boolean
          name: string
          organization_id: string | null
          slug: string
          validity_months: number | null
        }
        Insert: {
          annual_renewal?: boolean
          category?: string | null
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          estimated_minutes?: number | null
          id?: string
          is_global?: boolean
          is_published?: boolean
          name: string
          organization_id?: string | null
          slug: string
          validity_months?: number | null
        }
        Update: {
          annual_renewal?: boolean
          category?: string | null
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          estimated_minutes?: number | null
          id?: string
          is_global?: boolean
          is_published?: boolean
          name?: string
          organization_id?: string | null
          slug?: string
          validity_months?: number | null
        }
        Relationships: []
      }
      training_tracks: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          due_within_days: number | null
          id: string
          is_global: boolean
          is_published: boolean
          min_annual_hours: number | null
          name: string
          organization_id: string | null
          recurrence_months: number | null
          slug: string
          track_type: Database["public"]["Enums"]["track_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_within_days?: number | null
          id?: string
          is_global?: boolean
          is_published?: boolean
          min_annual_hours?: number | null
          name: string
          organization_id?: string | null
          recurrence_months?: number | null
          slug: string
          track_type?: Database["public"]["Enums"]["track_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_within_days?: number | null
          id?: string
          is_global?: boolean
          is_published?: boolean
          min_annual_hours?: number | null
          name?: string
          organization_id?: string | null
          recurrence_months?: number | null
          slug?: string
          track_type?: Database["public"]["Enums"]["track_type"]
          updated_at?: string
        }
        Relationships: []
      }
      user_training_progress: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          is_completed: boolean
          module_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          is_completed?: boolean
          module_id: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          is_completed?: boolean
          module_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_training_progress_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "training_modules"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      employee_client_assignments: {
        Row: {
          client_id: string | null
          created_at: string | null
          created_by: string | null
          employee_id: string | null
          id: string | null
          is_group_home_assignment: boolean | null
          organization_id: string | null
          tenant_id: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          employee_id?: string | null
          id?: string | null
          is_group_home_assignment?: boolean | null
          organization_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          employee_id?: string | null
          id?: string | null
          is_group_home_assignment?: boolean | null
          organization_id?: string | null
          tenant_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_invitation: { Args: { _token: string }; Returns: string }
      clients_for_staff: {
        Args: { _org: string; _staff: string }
        Returns: {
          account_status: string
          authorized_dspd_codes: string[]
          created_at: string
          first_name: string
          geofence_radius_feet: number
          home_latitude: number | null
          home_longitude: number | null
          id: string
          job_code: string[]
          last_name: string
          medicaid_id: string | null
          organization_id: string
          pcsp_goals: string[]
          phone_number: string | null
          physical_address: string | null
          team_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "clients"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      generate_pba_audit_sample: { Args: { _org: string }; Returns: number }
      has_org_role: {
        Args: {
          _org: string
          _role: Database["public"]["Enums"]["app_role"]
          _user: string
        }
        Returns: boolean
      }
      hybrid_search_timesheets: {
        Args: {
          _org: string
          caregiver_name: string
          client_name: string
          date_from: string
          date_to: string
          hour_min: number
          match_count: number
          query_embedding: string
        }
        Returns: {
          id: string
          similarity: number
        }[]
      }
      is_org_admin_or_manager: {
        Args: { _org: string; _user: string }
        Returns: boolean
      }
      is_org_member: { Args: { _org: string; _user: string }; Returns: boolean }
      is_super_admin: { Args: { _user: string }; Returns: boolean }
      match_timesheets: {
        Args: {
          _org?: string
          date_from?: string
          date_to?: string
          hour_min?: number
          match_count?: number
          query_embedding: string
        }
        Returns: {
          id: string
          similarity: number
        }[]
      }
      user_org_ids: { Args: { _user: string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "manager" | "employee" | "super_admin"
      assignment_status: "not_started" | "in_progress" | "completed" | "overdue"
      external_cert_status: "pending" | "approved" | "rejected" | "expired"
      invitation_status: "pending" | "accepted" | "revoked"
      track_type:
        | "onboarding_30"
        | "certification_90"
        | "behavioral"
        | "abi_specialty"
        | "annual"
        | "custom"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "manager", "employee", "super_admin"],
      assignment_status: ["not_started", "in_progress", "completed", "overdue"],
      external_cert_status: ["pending", "approved", "rejected", "expired"],
      invitation_status: ["pending", "accepted", "revoked"],
      track_type: [
        "onboarding_30",
        "certification_90",
        "behavioral",
        "abi_specialty",
        "annual",
        "custom",
      ],
    },
  },
} as const
