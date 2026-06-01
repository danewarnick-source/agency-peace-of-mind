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
      client_documents: {
        Row: {
          client_id: string
          document_type: string
          file_name: string
          file_size_bytes: number | null
          file_url: string
          id: string
          organization_id: string
          storage_path: string | null
          uploaded_at: string
          uploaded_by: string | null
          uploaded_by_name: string | null
        }
        Insert: {
          client_id: string
          document_type: string
          file_name: string
          file_size_bytes?: number | null
          file_url: string
          id?: string
          organization_id: string
          storage_path?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
          uploaded_by_name?: string | null
        }
        Update: {
          client_id?: string
          document_type?: string
          file_name?: string
          file_size_bytes?: number | null
          file_url?: string
          id?: string
          organization_id?: string
          storage_path?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
          uploaded_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_medications: {
        Row: {
          adverse_effects: string | null
          choking_risk: boolean
          choking_risk_details: string | null
          client_id: string
          created_at: string
          created_by: string | null
          diagnosis: string | null
          discontinued_at: string | null
          discontinued_by: string | null
          dosage: string | null
          end_date: string | null
          frequency: string | null
          id: string
          instructions: string | null
          is_active: boolean
          is_controlled: boolean
          is_prn: boolean
          medication_name: string
          organization_id: string
          pharmacy: string | null
          pill_count_current: number | null
          pill_count_updated_at: string | null
          prescriber: string | null
          prn_instructions: string | null
          purpose: string | null
          refill_date: string | null
          route: string | null
          rx_number: string | null
          scheduled_times: string[]
          start_date: string | null
        }
        Insert: {
          adverse_effects?: string | null
          choking_risk?: boolean
          choking_risk_details?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          diagnosis?: string | null
          discontinued_at?: string | null
          discontinued_by?: string | null
          dosage?: string | null
          end_date?: string | null
          frequency?: string | null
          id?: string
          instructions?: string | null
          is_active?: boolean
          is_controlled?: boolean
          is_prn?: boolean
          medication_name: string
          organization_id: string
          pharmacy?: string | null
          pill_count_current?: number | null
          pill_count_updated_at?: string | null
          prescriber?: string | null
          prn_instructions?: string | null
          purpose?: string | null
          refill_date?: string | null
          route?: string | null
          rx_number?: string | null
          scheduled_times?: string[]
          start_date?: string | null
        }
        Update: {
          adverse_effects?: string | null
          choking_risk?: boolean
          choking_risk_details?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          diagnosis?: string | null
          discontinued_at?: string | null
          discontinued_by?: string | null
          dosage?: string | null
          end_date?: string | null
          frequency?: string | null
          id?: string
          instructions?: string | null
          is_active?: boolean
          is_controlled?: boolean
          is_prn?: boolean
          medication_name?: string
          organization_id?: string
          pharmacy?: string | null
          pill_count_current?: number | null
          pill_count_updated_at?: string | null
          prescriber?: string | null
          prn_instructions?: string | null
          purpose?: string | null
          refill_date?: string | null
          route?: string | null
          rx_number?: string | null
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
          date_of_birth: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          feature_config: Json | null
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
          profile_photo_url: string | null
          special_directions: string | null
          team_id: string | null
        }
        Insert: {
          account_status?: string
          authorized_dspd_codes?: string[]
          created_at?: string
          date_of_birth?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          feature_config?: Json | null
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
          profile_photo_url?: string | null
          special_directions?: string | null
          team_id?: string | null
        }
        Update: {
          account_status?: string
          authorized_dspd_codes?: string[]
          created_at?: string
          date_of_birth?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          feature_config?: Json | null
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
          profile_photo_url?: string | null
          special_directions?: string | null
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
          ai_coaching_iterations: number
          ai_compliance_feedback: string | null
          ai_compliance_status: string | null
          ai_trigger_reasons: string[] | null
          approved_at: string | null
          approved_by: string | null
          backdated: boolean
          client_id: string
          created_at: string
          denial_reason: string | null
          denied_at: string | null
          denied_by: string | null
          followup_form_types: string[] | null
          id: string
          late_submission_reason: string | null
          log_date: string
          narrative: string
          organization_id: string
          original_due_date: string | null
          pcsp_goals_addressed: string[]
          requires_followup_form: boolean
          signature_data_url: string | null
          status: string
          submitted_at: string
          submitted_late: boolean
          user_id: string
          word_count: number | null
        }
        Insert: {
          ai_coaching_iterations?: number
          ai_compliance_feedback?: string | null
          ai_compliance_status?: string | null
          ai_trigger_reasons?: string[] | null
          approved_at?: string | null
          approved_by?: string | null
          backdated?: boolean
          client_id: string
          created_at?: string
          denial_reason?: string | null
          denied_at?: string | null
          denied_by?: string | null
          followup_form_types?: string[] | null
          id?: string
          late_submission_reason?: string | null
          log_date?: string
          narrative: string
          organization_id: string
          original_due_date?: string | null
          pcsp_goals_addressed?: string[]
          requires_followup_form?: boolean
          signature_data_url?: string | null
          status?: string
          submitted_at?: string
          submitted_late?: boolean
          user_id: string
          word_count?: number | null
        }
        Update: {
          ai_coaching_iterations?: number
          ai_compliance_feedback?: string | null
          ai_compliance_status?: string | null
          ai_trigger_reasons?: string[] | null
          approved_at?: string | null
          approved_by?: string | null
          backdated?: boolean
          client_id?: string
          created_at?: string
          denial_reason?: string | null
          denied_at?: string | null
          denied_by?: string | null
          followup_form_types?: string[] | null
          id?: string
          late_submission_reason?: string | null
          log_date?: string
          narrative?: string
          organization_id?: string
          original_due_date?: string | null
          pcsp_goals_addressed?: string[]
          requires_followup_form?: boolean
          signature_data_url?: string | null
          status?: string
          submitted_at?: string
          submitted_late?: boolean
          user_id?: string
          word_count?: number | null
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
          admin_review_notes: string | null
          admin_reviewed: boolean
          admin_reviewed_at: string | null
          admin_reviewed_by: string | null
          administered_at: string | null
          client_id: string
          created_at: string
          error_description: string | null
          exception_reason: string | null
          id: string
          is_controlled: boolean
          is_medication_error: boolean
          is_prn: boolean
          medication_id: string
          notes: string | null
          organization_id: string
          pill_count_value: number | null
          pill_count_verified: boolean | null
          prn_reason: string | null
          scheduled_for: string
          scheduled_time_label: string | null
          signature_attestation: string | null
          signature_data_url: string | null
          staff_id: string | null
          staff_name: string | null
          status: string
        }
        Insert: {
          admin_review_notes?: string | null
          admin_reviewed?: boolean
          admin_reviewed_at?: string | null
          admin_reviewed_by?: string | null
          administered_at?: string | null
          client_id: string
          created_at?: string
          error_description?: string | null
          exception_reason?: string | null
          id?: string
          is_controlled?: boolean
          is_medication_error?: boolean
          is_prn?: boolean
          medication_id: string
          notes?: string | null
          organization_id: string
          pill_count_value?: number | null
          pill_count_verified?: boolean | null
          prn_reason?: string | null
          scheduled_for: string
          scheduled_time_label?: string | null
          signature_attestation?: string | null
          signature_data_url?: string | null
          staff_id?: string | null
          staff_name?: string | null
          status: string
        }
        Update: {
          admin_review_notes?: string | null
          admin_reviewed?: boolean
          admin_reviewed_at?: string | null
          admin_reviewed_by?: string | null
          administered_at?: string | null
          client_id?: string
          created_at?: string
          error_description?: string | null
          exception_reason?: string | null
          id?: string
          is_controlled?: boolean
          is_medication_error?: boolean
          is_prn?: boolean
          medication_id?: string
          notes?: string | null
          organization_id?: string
          pill_count_value?: number | null
          pill_count_verified?: boolean | null
          prn_reason?: string | null
          scheduled_for?: string
          scheduled_time_label?: string | null
          signature_attestation?: string | null
          signature_data_url?: string | null
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
          ai_trigger_reasons: string[] | null
          approved_at: string | null
          approved_by: string | null
          client_id: string
          clock_in_timestamp: string
          clock_out_timestamp: string | null
          created_at: string
          denial_reason: string | null
          denied_at: string | null
          denied_by: string | null
          edit_audit_history_log: Json
          edited_by_admin_name: string | null
          followup_form_types: string[] | null
          geofence_variance_justification: string | null
          goals_completed: Json
          gps_in_coordinates: Json
          gps_out_coordinates: Json | null
          gps_validated: boolean
          id: string
          is_edited_by_admin: boolean
          is_out_of_bounds: boolean
          late_submission_reason: string | null
          organization_id: string
          outside_geofence_reason: string | null
          raw_clock_in: string | null
          raw_clock_out: string | null
          requires_followup_form: boolean
          rounded_clock_in: string | null
          rounded_clock_out: string | null
          service_type_code: string
          shift_entry_type: string
          shift_note_text: string | null
          staff_id: string
          status: string
          submitted_late: boolean
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
          ai_trigger_reasons?: string[] | null
          approved_at?: string | null
          approved_by?: string | null
          client_id: string
          clock_in_timestamp?: string
          clock_out_timestamp?: string | null
          created_at?: string
          denial_reason?: string | null
          denied_at?: string | null
          denied_by?: string | null
          edit_audit_history_log?: Json
          edited_by_admin_name?: string | null
          followup_form_types?: string[] | null
          geofence_variance_justification?: string | null
          goals_completed?: Json
          gps_in_coordinates: Json
          gps_out_coordinates?: Json | null
          gps_validated?: boolean
          id?: string
          is_edited_by_admin?: boolean
          is_out_of_bounds?: boolean
          late_submission_reason?: string | null
          organization_id: string
          outside_geofence_reason?: string | null
          raw_clock_in?: string | null
          raw_clock_out?: string | null
          requires_followup_form?: boolean
          rounded_clock_in?: string | null
          rounded_clock_out?: string | null
          service_type_code: string
          shift_entry_type: string
          shift_note_text?: string | null
          staff_id: string
          status?: string
          submitted_late?: boolean
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
          ai_trigger_reasons?: string[] | null
          approved_at?: string | null
          approved_by?: string | null
          client_id?: string
          clock_in_timestamp?: string
          clock_out_timestamp?: string | null
          created_at?: string
          denial_reason?: string | null
          denied_at?: string | null
          denied_by?: string | null
          edit_audit_history_log?: Json
          edited_by_admin_name?: string | null
          followup_form_types?: string[] | null
          geofence_variance_justification?: string | null
          goals_completed?: Json
          gps_in_coordinates?: Json
          gps_out_coordinates?: Json | null
          gps_validated?: boolean
          id?: string
          is_edited_by_admin?: boolean
          is_out_of_bounds?: boolean
          late_submission_reason?: string | null
          organization_id?: string
          outside_geofence_reason?: string | null
          raw_clock_in?: string | null
          raw_clock_out?: string | null
          requires_followup_form?: boolean
          rounded_clock_in?: string | null
          rounded_clock_out?: string | null
          service_type_code?: string
          shift_entry_type?: string
          shift_note_text?: string | null
          staff_id?: string
          status?: string
          submitted_late?: boolean
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
      hhs_client_inventories: {
        Row: {
          added_on: string
          asset_description: string
          client_id: string
          created_at: string
          estimated_value: number
          id: string
          organization_id: string
          provider_id: string
          removal_reason: string | null
          removal_signature: string | null
          removed_on: string | null
          status: string
        }
        Insert: {
          added_on?: string
          asset_description: string
          client_id: string
          created_at?: string
          estimated_value: number
          id?: string
          organization_id: string
          provider_id: string
          removal_reason?: string | null
          removal_signature?: string | null
          removed_on?: string | null
          status?: string
        }
        Update: {
          added_on?: string
          asset_description?: string
          client_id?: string
          created_at?: string
          estimated_value?: number
          id?: string
          organization_id?: string
          provider_id?: string
          removal_reason?: string | null
          removal_signature?: string | null
          removed_on?: string | null
          status?: string
        }
        Relationships: []
      }
      hhs_daily_records: {
        Row: {
          ai_compliance_feedback: string | null
          ai_compliance_status: string | null
          client_id: string
          created_at: string
          id: string
          narrative: string
          organization_id: string
          pcsp_goals_addressed: string[]
          provider_id: string
          record_date: string
          signature_data_url: string | null
          updated_at: string
        }
        Insert: {
          ai_compliance_feedback?: string | null
          ai_compliance_status?: string | null
          client_id: string
          created_at?: string
          id?: string
          narrative: string
          organization_id: string
          pcsp_goals_addressed?: string[]
          provider_id: string
          record_date?: string
          signature_data_url?: string | null
          updated_at?: string
        }
        Update: {
          ai_compliance_feedback?: string | null
          ai_compliance_status?: string | null
          client_id?: string
          created_at?: string
          id?: string
          narrative?: string
          organization_id?: string
          pcsp_goals_addressed?: string[]
          provider_id?: string
          record_date?: string
          signature_data_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      hhs_emar_logs: {
        Row: {
          administered_at: string | null
          attestation_signed: boolean
          client_id: string
          created_at: string
          dosage: string | null
          exception_reason: string | null
          id: string
          is_controlled: boolean
          is_medication_error: boolean
          is_prn: boolean
          medication_id: string | null
          medication_name: string
          organization_id: string
          pill_count_value: number | null
          pill_count_verified: boolean | null
          prn_reason: string | null
          provider_id: string
          record_date: string
          route: string | null
          scheduled_for: string
          signature_attestation: string | null
          staff_name: string | null
          status: string
          variance_note: string | null
        }
        Insert: {
          administered_at?: string | null
          attestation_signed?: boolean
          client_id: string
          created_at?: string
          dosage?: string | null
          exception_reason?: string | null
          id?: string
          is_controlled?: boolean
          is_medication_error?: boolean
          is_prn?: boolean
          medication_id?: string | null
          medication_name: string
          organization_id: string
          pill_count_value?: number | null
          pill_count_verified?: boolean | null
          prn_reason?: string | null
          provider_id: string
          record_date?: string
          route?: string | null
          scheduled_for: string
          signature_attestation?: string | null
          staff_name?: string | null
          status: string
          variance_note?: string | null
        }
        Update: {
          administered_at?: string | null
          attestation_signed?: boolean
          client_id?: string
          created_at?: string
          dosage?: string | null
          exception_reason?: string | null
          id?: string
          is_controlled?: boolean
          is_medication_error?: boolean
          is_prn?: boolean
          medication_id?: string | null
          medication_name?: string
          organization_id?: string
          pill_count_value?: number | null
          pill_count_verified?: boolean | null
          prn_reason?: string | null
          provider_id?: string
          record_date?: string
          route?: string | null
          scheduled_for?: string
          signature_attestation?: string | null
          staff_name?: string | null
          status?: string
          variance_note?: string | null
        }
        Relationships: []
      }
      hhs_evacuation_drills: {
        Row: {
          client_id: string
          created_at: string
          drill_executed_at: string
          evacuation_duration_seconds: number
          id: string
          notes: string | null
          organization_id: string
          provider_id: string
          record_date: string
          simulation_type: string
        }
        Insert: {
          client_id: string
          created_at?: string
          drill_executed_at: string
          evacuation_duration_seconds: number
          id?: string
          notes?: string | null
          organization_id: string
          provider_id: string
          record_date?: string
          simulation_type: string
        }
        Update: {
          client_id?: string
          created_at?: string
          drill_executed_at?: string
          evacuation_duration_seconds?: number
          id?: string
          notes?: string | null
          organization_id?: string
          provider_id?: string
          record_date?: string
          simulation_type?: string
        }
        Relationships: []
      }
      hhs_incident_reports: {
        Row: {
          client_id: string
          created_at: string
          description: string
          guardian_contact_at: string | null
          guardian_contact_method: string | null
          guardian_notified: boolean | null
          guardian_response: string | null
          id: string
          incident_address: string | null
          incident_categories: string[]
          incident_type_other: string | null
          individuals_involved: Json
          narrative_after: string | null
          narrative_before: string | null
          narrative_during: string | null
          occurred_at: string
          organization_id: string
          protective_actions: string | null
          provider_id: string
          status: string
          updated_at: string
          upi_filed_at: string | null
          upi_filed_by: string | null
          upi_reference_number: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          description: string
          guardian_contact_at?: string | null
          guardian_contact_method?: string | null
          guardian_notified?: boolean | null
          guardian_response?: string | null
          id?: string
          incident_address?: string | null
          incident_categories?: string[]
          incident_type_other?: string | null
          individuals_involved?: Json
          narrative_after?: string | null
          narrative_before?: string | null
          narrative_during?: string | null
          occurred_at: string
          organization_id: string
          protective_actions?: string | null
          provider_id: string
          status?: string
          updated_at?: string
          upi_filed_at?: string | null
          upi_filed_by?: string | null
          upi_reference_number?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          description?: string
          guardian_contact_at?: string | null
          guardian_contact_method?: string | null
          guardian_notified?: boolean | null
          guardian_response?: string | null
          id?: string
          incident_address?: string | null
          incident_categories?: string[]
          incident_type_other?: string | null
          individuals_involved?: Json
          narrative_after?: string | null
          narrative_before?: string | null
          narrative_during?: string | null
          occurred_at?: string
          organization_id?: string
          protective_actions?: string | null
          provider_id?: string
          status?: string
          updated_at?: string
          upi_filed_at?: string | null
          upi_filed_by?: string | null
          upi_reference_number?: string | null
        }
        Relationships: []
      }
      hhs_medical_logs: {
        Row: {
          appointment_at: string
          client_id: string
          created_at: string
          facility_name: string
          follow_up_date: string | null
          id: string
          orders_changes: string | null
          organization_id: string
          provider_id: string
          reason: string
          record_date: string
        }
        Insert: {
          appointment_at: string
          client_id: string
          created_at?: string
          facility_name: string
          follow_up_date?: string | null
          id?: string
          orders_changes?: string | null
          organization_id: string
          provider_id: string
          reason: string
          record_date?: string
        }
        Update: {
          appointment_at?: string
          client_id?: string
          created_at?: string
          facility_name?: string
          follow_up_date?: string | null
          id?: string
          orders_changes?: string | null
          organization_id?: string
          provider_id?: string
          reason?: string
          record_date?: string
        }
        Relationships: []
      }
      hhs_monthly_attendance: {
        Row: {
          attestation_accepted: boolean
          away_category: string | null
          away_reason: string | null
          client_id: string
          created_at: string
          electronic_signature_timestamp: string | null
          id: string
          organization_id: string
          presence_status: string
          provider_id: string
          record_date: string
          signee_ip_address: string | null
          signee_user_id: string | null
          staff_initials_signature: string | null
        }
        Insert: {
          attestation_accepted?: boolean
          away_category?: string | null
          away_reason?: string | null
          client_id: string
          created_at?: string
          electronic_signature_timestamp?: string | null
          id?: string
          organization_id: string
          presence_status: string
          provider_id: string
          record_date: string
          signee_ip_address?: string | null
          signee_user_id?: string | null
          staff_initials_signature?: string | null
        }
        Update: {
          attestation_accepted?: boolean
          away_category?: string | null
          away_reason?: string | null
          client_id?: string
          created_at?: string
          electronic_signature_timestamp?: string | null
          id?: string
          organization_id?: string
          presence_status?: string
          provider_id?: string
          record_date?: string
          signee_ip_address?: string | null
          signee_user_id?: string | null
          staff_initials_signature?: string | null
        }
        Relationships: []
      }
      hhs_monthly_summaries: {
        Row: {
          client_id: string
          community_outings: Json
          created_at: string
          id: string
          organization_id: string
          pcsp_progress_narrative: string
          provider_id: string
          target_month: string
        }
        Insert: {
          client_id: string
          community_outings?: Json
          created_at?: string
          id?: string
          organization_id: string
          pcsp_progress_narrative: string
          provider_id: string
          target_month: string
        }
        Update: {
          client_id?: string
          community_outings?: Json
          created_at?: string
          id?: string
          organization_id?: string
          pcsp_progress_narrative?: string
          provider_id?: string
          target_month?: string
        }
        Relationships: []
      }
      hhs_transfer_logs: {
        Row: {
          client_id: string
          communication_summary: string
          created_at: string
          id: string
          organization_id: string
          party_type: string
          provider_id: string
          receiving_party: string
          record_date: string
          transferred_at: string
        }
        Insert: {
          client_id: string
          communication_summary: string
          created_at?: string
          id?: string
          organization_id: string
          party_type: string
          provider_id: string
          receiving_party: string
          record_date?: string
          transferred_at?: string
        }
        Update: {
          client_id?: string
          communication_summary?: string
          created_at?: string
          id?: string
          organization_id?: string
          party_type?: string
          provider_id?: string
          receiving_party?: string
          record_date?: string
          transferred_at?: string
        }
        Relationships: []
      }
      incident_reports: {
        Row: {
          additional_client_ids: string[] | null
          ai_trigger_reasons: string[] | null
          amendment_reason: string | null
          aps_notified: boolean | null
          client_id: string
          created_at: string
          family_name: string | null
          family_notified: boolean | null
          family_notified_at: string | null
          filed_at: string
          id: string
          immediate_actions: string
          incident_address: string | null
          incident_city: string | null
          incident_date: string
          incident_state: string | null
          incident_time: string
          incident_types: string[]
          incident_zip: string | null
          law_enforcement_called: boolean | null
          location_detail: string | null
          location_type: string | null
          medical_attention_required: boolean | null
          medical_facility: string | null
          medical_outcome: string | null
          medical_response_type: string | null
          narrative_after: string
          narrative_before: string
          narrative_during: string
          organization_id: string
          other_individuals: Json | null
          report_number: string
          reported_by: string
          reporter_title: string | null
          staff_involved: Json | null
          staff_signature_url: string | null
          state_confirmation_number: string | null
          state_submission_deadline: string | null
          state_submitted_at: string | null
          state_submitted_by: string | null
          status: string
          submitted_at: string
          supervisor_name: string | null
          supervisor_notified: boolean | null
          supervisor_notified_at: string | null
          triggered_by_note_id: string | null
          triggered_by_note_type: string | null
          updated_at: string
          witnesses: Json | null
        }
        Insert: {
          additional_client_ids?: string[] | null
          ai_trigger_reasons?: string[] | null
          amendment_reason?: string | null
          aps_notified?: boolean | null
          client_id: string
          created_at?: string
          family_name?: string | null
          family_notified?: boolean | null
          family_notified_at?: string | null
          filed_at?: string
          id?: string
          immediate_actions?: string
          incident_address?: string | null
          incident_city?: string | null
          incident_date: string
          incident_state?: string | null
          incident_time: string
          incident_types?: string[]
          incident_zip?: string | null
          law_enforcement_called?: boolean | null
          location_detail?: string | null
          location_type?: string | null
          medical_attention_required?: boolean | null
          medical_facility?: string | null
          medical_outcome?: string | null
          medical_response_type?: string | null
          narrative_after?: string
          narrative_before?: string
          narrative_during?: string
          organization_id: string
          other_individuals?: Json | null
          report_number: string
          reported_by: string
          reporter_title?: string | null
          staff_involved?: Json | null
          staff_signature_url?: string | null
          state_confirmation_number?: string | null
          state_submission_deadline?: string | null
          state_submitted_at?: string | null
          state_submitted_by?: string | null
          status?: string
          submitted_at?: string
          supervisor_name?: string | null
          supervisor_notified?: boolean | null
          supervisor_notified_at?: string | null
          triggered_by_note_id?: string | null
          triggered_by_note_type?: string | null
          updated_at?: string
          witnesses?: Json | null
        }
        Update: {
          additional_client_ids?: string[] | null
          ai_trigger_reasons?: string[] | null
          amendment_reason?: string | null
          aps_notified?: boolean | null
          client_id?: string
          created_at?: string
          family_name?: string | null
          family_notified?: boolean | null
          family_notified_at?: string | null
          filed_at?: string
          id?: string
          immediate_actions?: string
          incident_address?: string | null
          incident_city?: string | null
          incident_date?: string
          incident_state?: string | null
          incident_time?: string
          incident_types?: string[]
          incident_zip?: string | null
          law_enforcement_called?: boolean | null
          location_detail?: string | null
          location_type?: string | null
          medical_attention_required?: boolean | null
          medical_facility?: string | null
          medical_outcome?: string | null
          medical_response_type?: string | null
          narrative_after?: string
          narrative_before?: string
          narrative_during?: string
          organization_id?: string
          other_individuals?: Json | null
          report_number?: string
          reported_by?: string
          reporter_title?: string | null
          staff_involved?: Json | null
          staff_signature_url?: string | null
          state_confirmation_number?: string | null
          state_submission_deadline?: string | null
          state_submitted_at?: string | null
          state_submitted_by?: string | null
          status?: string
          submitted_at?: string
          supervisor_name?: string | null
          supervisor_notified?: boolean | null
          supervisor_notified_at?: string | null
          triggered_by_note_id?: string | null
          triggered_by_note_type?: string | null
          updated_at?: string
          witnesses?: Json | null
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
      notifications: {
        Row: {
          body: string
          created_at: string
          dismissed_at: string | null
          id: string
          link_to: string | null
          organization_id: string
          read_at: string | null
          recipient_role: string
          related_id: string | null
          related_type: string | null
          title: string
          type: string
          urgency: string
        }
        Insert: {
          body: string
          created_at?: string
          dismissed_at?: string | null
          id?: string
          link_to?: string | null
          organization_id: string
          read_at?: string | null
          recipient_role?: string
          related_id?: string | null
          related_type?: string | null
          title: string
          type: string
          urgency?: string
        }
        Update: {
          body?: string
          created_at?: string
          dismissed_at?: string | null
          id?: string
          link_to?: string | null
          organization_id?: string
          read_at?: string | null
          recipient_role?: string
          related_id?: string | null
          related_type?: string | null
          title?: string
          type?: string
          urgency?: string
        }
        Relationships: []
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
          hourly_rate: number | null
          id: string
          is_active: boolean
          last_name: string | null
          must_change_password: boolean
          position: string | null
          system_role: string
          team_id: string | null
          tenant_id: string | null
          username: string | null
          worker_type: string
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
          hourly_rate?: number | null
          id: string
          is_active?: boolean
          last_name?: string | null
          must_change_password?: boolean
          position?: string | null
          system_role?: string
          team_id?: string | null
          tenant_id?: string | null
          username?: string | null
          worker_type?: string
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
          hourly_rate?: number | null
          id?: string
          is_active?: boolean
          last_name?: string | null
          must_change_password?: boolean
          position?: string | null
          system_role?: string
          team_id?: string | null
          tenant_id?: string | null
          username?: string | null
          worker_type?: string
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
      scheduled_shifts: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          is_recurring: boolean
          job_code: string | null
          notes: string | null
          organization_id: string
          published: boolean
          recurrence_end_date: string | null
          recurrence_rule: string | null
          shift_type: string
          staff_id: string
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          is_recurring?: boolean
          job_code?: string | null
          notes?: string | null
          organization_id: string
          published?: boolean
          recurrence_end_date?: string | null
          recurrence_rule?: string | null
          shift_type?: string
          staff_id: string
          starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          is_recurring?: boolean
          job_code?: string | null
          notes?: string | null
          organization_id?: string
          published?: boolean
          recurrence_end_date?: string | null
          recurrence_rule?: string | null
          shift_type?: string
          staff_id?: string
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_shifts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_shifts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_shifts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      time_pay_categories: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          is_builtin: boolean
          label: string
          organization_id: string
          requires_description: boolean
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          is_builtin?: boolean
          label: string
          organization_id: string
          requires_description?: boolean
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          is_builtin?: boolean
          label?: string
          organization_id?: string
          requires_description?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      time_pay_settings: {
        Row: {
          allow_non_client_clockins: boolean
          contractor_period_anchor: string
          contractor_schedule: string
          created_at: string
          organization_id: string
          pay_between_clients: boolean
          updated_at: string
          updated_by: string | null
          w2_period_anchor: string
          w2_schedule: string
        }
        Insert: {
          allow_non_client_clockins?: boolean
          contractor_period_anchor?: string
          contractor_schedule?: string
          created_at?: string
          organization_id: string
          pay_between_clients?: boolean
          updated_at?: string
          updated_by?: string | null
          w2_period_anchor?: string
          w2_schedule?: string
        }
        Update: {
          allow_non_client_clockins?: boolean
          contractor_period_anchor?: string
          contractor_schedule?: string
          created_at?: string
          organization_id?: string
          pay_between_clients?: boolean
          updated_at?: string
          updated_by?: string | null
          w2_period_anchor?: string
          w2_schedule?: string
        }
        Relationships: []
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
          date_of_birth: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          feature_config: Json | null
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
          profile_photo_url: string | null
          special_directions: string | null
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
      notify_incident_filed: {
        Args: {
          p_client_name: string
          p_deadline: string
          p_incident_id: string
          p_organization_id: string
          p_reporter_name: string
        }
        Returns: undefined
      }
      notify_medication_error: {
        Args: {
          p_client_name: string
          p_description: string
          p_emar_log_id: string
          p_med_name: string
          p_organization_id: string
          p_reporter_name: string
        }
        Returns: undefined
      }
      restore_my_admin_role: { Args: never; Returns: undefined }
      user_org_ids: { Args: { _user: string }; Returns: string[] }
      verify_certification: {
        Args: { _code: string }
        Returns: {
          course_title: string
          expires_at: string
          issued_at: string
          recipient_name: string
          verification_code: string
        }[]
      }
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
