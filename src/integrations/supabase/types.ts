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
      activity_reimbursement_requests: {
        Row: {
          activity_description: string
          client_id: string | null
          created_at: string
          estimated_cost: number
          event_summary: string | null
          id: string
          organization_id: string
          reason: string
          receipt_paths: string[]
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          shift_id: string
          staff_id: string
          status: string
          summary_submitted_at: string | null
          updated_at: string
        }
        Insert: {
          activity_description: string
          client_id?: string | null
          created_at?: string
          estimated_cost: number
          event_summary?: string | null
          id?: string
          organization_id: string
          reason: string
          receipt_paths?: string[]
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shift_id: string
          staff_id: string
          status?: string
          summary_submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          activity_description?: string
          client_id?: string | null
          created_at?: string
          estimated_cost?: number
          event_summary?: string | null
          id?: string
          organization_id?: string
          reason?: string
          receipt_paths?: string[]
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          shift_id?: string
          staff_id?: string
          status?: string
          summary_submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_reimbursement_requests_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "evv_timesheets"
            referencedColumns: ["id"]
          },
        ]
      }
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
      assignment_map: {
        Row: {
          client_record_id: string | null
          client_subject_id: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          id: string
          import_job_id: string
          inference_reason: string | null
          org_id: string
          relation_type: string
          staff_record_id: string | null
          staff_subject_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          client_record_id?: string | null
          client_subject_id?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          import_job_id: string
          inference_reason?: string | null
          org_id: string
          relation_type: string
          staff_record_id?: string | null
          staff_subject_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          client_record_id?: string | null
          client_subject_id?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          import_job_id?: string
          inference_reason?: string | null
          org_id?: string
          relation_type?: string
          staff_record_id?: string | null
          staff_subject_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_map_client_subject_id_fkey"
            columns: ["client_subject_id"]
            isOneToOne: false
            referencedRelation: "import_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_map_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_map_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_map_staff_subject_id_fkey"
            columns: ["staff_subject_id"]
            isOneToOne: false
            referencedRelation: "import_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_file_documents: {
        Row: {
          added_by: string | null
          audit_file_id: string
          category: string | null
          created_at: string
          external_ref: string | null
          id: string
          mime_type: string | null
          organization_id: string
          size_bytes: number | null
          source: string
          storage_path: string | null
          title: string
        }
        Insert: {
          added_by?: string | null
          audit_file_id: string
          category?: string | null
          created_at?: string
          external_ref?: string | null
          id?: string
          mime_type?: string | null
          organization_id: string
          size_bytes?: number | null
          source: string
          storage_path?: string | null
          title: string
        }
        Update: {
          added_by?: string | null
          audit_file_id?: string
          category?: string | null
          created_at?: string
          external_ref?: string | null
          id?: string
          mime_type?: string | null
          organization_id?: string
          size_bytes?: number | null
          source?: string
          storage_path?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_file_documents_audit_file_id_fkey"
            columns: ["audit_file_id"]
            isOneToOne: false
            referencedRelation: "audit_files"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_files: {
        Row: {
          audit_packet_id: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          organization_id: string
          period_month: string
          reviewed_at: string | null
          reviewed_by: string | null
          sent_to_audit_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          audit_packet_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          period_month: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          sent_to_audit_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          audit_packet_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          period_month?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          sent_to_audit_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_files_audit_packet_id_fkey"
            columns: ["audit_packet_id"]
            isOneToOne: false
            referencedRelation: "audit_packets"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_packet_items: {
        Row: {
          created_at: string
          description: string | null
          evidence_count: number
          evidence_refs: Json
          id: string
          notes: string | null
          organization_id: string
          packet_id: string
          position: number
          required: boolean
          reviewed_at: string | null
          reviewed_by: string | null
          source_hint: string | null
          status: string
          sub_folder: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          evidence_count?: number
          evidence_refs?: Json
          id?: string
          notes?: string | null
          organization_id: string
          packet_id: string
          position?: number
          required?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_hint?: string | null
          status?: string
          sub_folder: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          evidence_count?: number
          evidence_refs?: Json
          id?: string
          notes?: string | null
          organization_id?: string
          packet_id?: string
          position?: number
          required?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_hint?: string | null
          status?: string
          sub_folder?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_packet_items_packet_id_fkey"
            columns: ["packet_id"]
            isOneToOne: false
            referencedRelation: "audit_packets"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_packets: {
        Row: {
          audit_letter_path: string | null
          audit_letter_text: string | null
          created_at: string
          created_by: string | null
          expectations_summary: string | null
          fiscal_year: string
          id: string
          name: string
          organization_id: string
          provider_name: string
          status: string
          timeline_end: string | null
          timeline_start: string | null
          updated_at: string
        }
        Insert: {
          audit_letter_path?: string | null
          audit_letter_text?: string | null
          created_at?: string
          created_by?: string | null
          expectations_summary?: string | null
          fiscal_year: string
          id?: string
          name: string
          organization_id: string
          provider_name: string
          status?: string
          timeline_end?: string | null
          timeline_start?: string | null
          updated_at?: string
        }
        Update: {
          audit_letter_path?: string | null
          audit_letter_text?: string | null
          created_at?: string
          created_by?: string | null
          expectations_summary?: string | null
          fiscal_year?: string
          id?: string
          name?: string
          organization_id?: string
          provider_name?: string
          status?: string
          timeline_end?: string | null
          timeline_start?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      auditor_share_access_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_user_id: string | null
          created_at: string
          id: string
          organization_id: string
          payload: Json
          share_id: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          organization_id: string
          payload?: Json
          share_id: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          payload?: Json
          share_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auditor_share_access_log_share_id_fkey"
            columns: ["share_id"]
            isOneToOne: false
            referencedRelation: "auditor_shares"
            referencedColumns: ["id"]
          },
        ]
      }
      auditor_share_items: {
        Row: {
          audit_file_id: string | null
          created_at: string
          id: string
          packet_item_id: string | null
          share_id: string
        }
        Insert: {
          audit_file_id?: string | null
          created_at?: string
          id?: string
          packet_item_id?: string | null
          share_id: string
        }
        Update: {
          audit_file_id?: string | null
          created_at?: string
          id?: string
          packet_item_id?: string | null
          share_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auditor_share_items_audit_file_id_fkey"
            columns: ["audit_file_id"]
            isOneToOne: false
            referencedRelation: "audit_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditor_share_items_packet_item_id_fkey"
            columns: ["packet_item_id"]
            isOneToOne: false
            referencedRelation: "audit_packet_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditor_share_items_share_id_fkey"
            columns: ["share_id"]
            isOneToOne: false
            referencedRelation: "auditor_shares"
            referencedColumns: ["id"]
          },
        ]
      }
      auditor_shares: {
        Row: {
          created_at: string
          created_by: string
          ends_at: string
          id: string
          message: string | null
          organization_id: string
          packet_id: string
          recipient_email: string
          revoked_at: string | null
          revoked_by: string | null
          share_all_items: boolean
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          ends_at: string
          id?: string
          message?: string | null
          organization_id: string
          packet_id: string
          recipient_email: string
          revoked_at?: string | null
          revoked_by?: string | null
          share_all_items?: boolean
          starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          ends_at?: string
          id?: string
          message?: string | null
          organization_id?: string
          packet_id?: string
          recipient_email?: string
          revoked_at?: string | null
          revoked_by?: string | null
          share_all_items?: boolean
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "auditor_shares_packet_id_fkey"
            columns: ["packet_id"]
            isOneToOne: false
            referencedRelation: "audit_packets"
            referencedColumns: ["id"]
          },
        ]
      }
      bc_behaviors: {
        Row: {
          approved_at: string | null
          approved_by_user_id: string | null
          bsp_citation: string
          client_id: string
          created_at: string
          data_method: string
          drafted_by_user_id: string | null
          expected_cadence: string
          id: string
          last_logged_at: string | null
          name: string
          operational_definition: string
          organization_id: string
          published_at: string | null
          published_by_user_id: string | null
          source: Database["public"]["Enums"]["bc_behavior_source"]
          status: Database["public"]["Enums"]["bc_behavior_status"]
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by_user_id?: string | null
          bsp_citation?: string
          client_id: string
          created_at?: string
          data_method?: string
          drafted_by_user_id?: string | null
          expected_cadence?: string
          id?: string
          last_logged_at?: string | null
          name: string
          operational_definition?: string
          organization_id: string
          published_at?: string | null
          published_by_user_id?: string | null
          source?: Database["public"]["Enums"]["bc_behavior_source"]
          status?: Database["public"]["Enums"]["bc_behavior_status"]
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by_user_id?: string | null
          bsp_citation?: string
          client_id?: string
          created_at?: string
          data_method?: string
          drafted_by_user_id?: string | null
          expected_cadence?: string
          id?: string
          last_logged_at?: string | null
          name?: string
          operational_definition?: string
          organization_id?: string
          published_at?: string | null
          published_by_user_id?: string | null
          source?: Database["public"]["Enums"]["bc_behavior_source"]
          status?: Database["public"]["Enums"]["bc_behavior_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bc_behaviors_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bc_behaviors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bc_data_entries: {
        Row: {
          abc_antecedent: string
          abc_behavior: string
          abc_consequence: string
          behavior_id: string
          client_id: string
          count: number | null
          created_at: string
          duration_seconds: number | null
          id: string
          intensity: number | null
          note: string
          occurred_at: string
          organization_id: string
          staff_user_id: string
          updated_at: string
        }
        Insert: {
          abc_antecedent?: string
          abc_behavior?: string
          abc_consequence?: string
          behavior_id: string
          client_id: string
          count?: number | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          intensity?: number | null
          note?: string
          occurred_at?: string
          organization_id: string
          staff_user_id: string
          updated_at?: string
        }
        Update: {
          abc_antecedent?: string
          abc_behavior?: string
          abc_consequence?: string
          behavior_id?: string
          client_id?: string
          count?: number | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          intensity?: number | null
          note?: string
          occurred_at?: string
          organization_id?: string
          staff_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bc_data_entries_behavior_id_fkey"
            columns: ["behavior_id"]
            isOneToOne: false
            referencedRelation: "bc_behaviors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bc_data_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bc_data_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bc_documents: {
        Row: {
          client_id: string
          created_at: string
          doc_type: Database["public"]["Enums"]["bc_doc_type"]
          id: string
          is_current: boolean
          organization_id: string
          storage_path: string
          updated_at: string
          uploaded_at: string
          uploaded_by_user_id: string
          version: number
        }
        Insert: {
          client_id: string
          created_at?: string
          doc_type: Database["public"]["Enums"]["bc_doc_type"]
          id?: string
          is_current?: boolean
          organization_id: string
          storage_path: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by_user_id: string
          version?: number
        }
        Update: {
          client_id?: string
          created_at?: string
          doc_type?: Database["public"]["Enums"]["bc_doc_type"]
          id?: string
          is_current?: boolean
          organization_id?: string
          storage_path?: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by_user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "bc_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bc_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bc_flags: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by_user_id: string | null
          client_id: string
          created_at: string
          detail: string
          flag_type: Database["public"]["Enums"]["bc_flag_type"]
          id: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by_user_id?: string | null
          client_id: string
          created_at?: string
          detail?: string
          flag_type: Database["public"]["Enums"]["bc_flag_type"]
          id?: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by_user_id?: string | null
          client_id?: string
          created_at?: string
          detail?: string
          flag_type?: Database["public"]["Enums"]["bc_flag_type"]
          id?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bc_flags_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bc_flags_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bc_review_notes: {
        Row: {
          author_user_id: string
          body: string
          client_id: string
          created_at: string
          id: string
          note_type: Database["public"]["Enums"]["bc_review_note_type"]
          organization_id: string
          period_end: string | null
          period_start: string | null
          updated_at: string
        }
        Insert: {
          author_user_id: string
          body?: string
          client_id: string
          created_at?: string
          id?: string
          note_type?: Database["public"]["Enums"]["bc_review_note_type"]
          organization_id: string
          period_end?: string | null
          period_start?: string | null
          updated_at?: string
        }
        Update: {
          author_user_id?: string
          body?: string
          client_id?: string
          created_at?: string
          id?: string
          note_type?: Database["public"]["Enums"]["bc_review_note_type"]
          organization_id?: string
          period_end?: string | null
          period_start?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bc_review_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bc_review_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      behavior_support_clients: {
        Row: {
          assigned_behaviorist_user_id: string | null
          bc_code: Database["public"]["Enums"]["bc_code"]
          client_id: string
          created_at: string
          features_enabled: boolean
          id: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          assigned_behaviorist_user_id?: string | null
          bc_code: Database["public"]["Enums"]["bc_code"]
          client_id: string
          created_at?: string
          features_enabled?: boolean
          id?: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          assigned_behaviorist_user_id?: string | null
          bc_code?: Database["public"]["Enums"]["bc_code"]
          client_id?: string
          created_at?: string
          features_enabled?: boolean
          id?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "behavior_support_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "behavior_support_clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_submission_audit_log: {
        Row: {
          action: string
          actor_name: string | null
          actor_user_id: string | null
          created_at: string
          id: string
          item_id: string | null
          item_type: string | null
          organization_id: string
          payload: Json
          submission_id: string
        }
        Insert: {
          action: string
          actor_name?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          item_id?: string | null
          item_type?: string | null
          organization_id: string
          payload?: Json
          submission_id: string
        }
        Update: {
          action?: string
          actor_name?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          item_id?: string | null
          item_type?: string | null
          organization_id?: string
          payload?: Json
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_submission_audit_log_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "billing_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_submission_warnings: {
        Row: {
          acted_by: string | null
          action_at: string | null
          action_note: string | null
          actor_name: string | null
          created_at: string
          id: string
          message: string
          organization_id: string
          related_ids: Json
          row_key: string | null
          severity: string
          status: string
          submission_id: string
          warning_type: string
        }
        Insert: {
          acted_by?: string | null
          action_at?: string | null
          action_note?: string | null
          actor_name?: string | null
          created_at?: string
          id?: string
          message: string
          organization_id: string
          related_ids?: Json
          row_key?: string | null
          severity?: string
          status?: string
          submission_id: string
          warning_type: string
        }
        Update: {
          acted_by?: string | null
          action_at?: string | null
          action_note?: string | null
          actor_name?: string | null
          created_at?: string
          id?: string
          message?: string
          organization_id?: string
          related_ids?: Json
          row_key?: string | null
          severity?: string
          status?: string
          submission_id?: string
          warning_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_submission_warnings_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "billing_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_submissions: {
        Row: {
          attestation_signature_name: string | null
          attestation_text: string | null
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          period_end: string
          period_start: string
          status: string
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string
        }
        Insert: {
          attestation_signature_name?: string | null
          attestation_text?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          period_end: string
          period_start: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
        }
        Update: {
          attestation_signature_name?: string | null
          attestation_text?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          period_end?: string
          period_start?: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      callout_escalation_events: {
        Row: {
          callout_id: string
          channel: string
          created_at: string
          detail: string | null
          id: string
          organization_id: string
          outcome: string
          step: number
          target_role: string | null
          target_user_id: string | null
        }
        Insert: {
          callout_id: string
          channel: string
          created_at?: string
          detail?: string | null
          id?: string
          organization_id: string
          outcome: string
          step: number
          target_role?: string | null
          target_user_id?: string | null
        }
        Update: {
          callout_id?: string
          channel?: string
          created_at?: string
          detail?: string | null
          id?: string
          organization_id?: string
          outcome?: string
          step?: number
          target_role?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "callout_escalation_events_callout_id_fkey"
            columns: ["callout_id"]
            isOneToOne: false
            referencedRelation: "shift_callouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "callout_escalation_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "callout_escalation_events_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "org_member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "callout_escalation_events_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ce_ledger: {
        Row: {
          active_minutes: number
          attestation_text: string
          ce_year_start: string
          completed_at: string
          content_hash: string
          created_at: string
          hours: number
          id: string
          module_id: string | null
          organization_id: string
          signature_name: string
          source: string | null
          staff_id: string
          title: string
          type: string
        }
        Insert: {
          active_minutes: number
          attestation_text: string
          ce_year_start: string
          completed_at?: string
          content_hash: string
          created_at?: string
          hours: number
          id?: string
          module_id?: string | null
          organization_id: string
          signature_name: string
          source?: string | null
          staff_id: string
          title: string
          type: string
        }
        Update: {
          active_minutes?: number
          attestation_text?: string
          ce_year_start?: string
          completed_at?: string
          content_hash?: string
          created_at?: string
          hours?: number
          id?: string
          module_id?: string | null
          organization_id?: string
          signature_name?: string
          source?: string | null
          staff_id?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ce_ledger_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "ce_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ce_ledger_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ce_modules: {
        Row: {
          active_seconds: number
          completed_at: string | null
          created_at: string
          current_step: number
          generated_at: string | null
          id: string
          organization_id: string
          period: string
          reflections: Json
          source_summary: string | null
          staff_id: string
          status: string
          steps: Json
          updated_at: string
        }
        Insert: {
          active_seconds?: number
          completed_at?: string | null
          created_at?: string
          current_step?: number
          generated_at?: string | null
          id?: string
          organization_id: string
          period: string
          reflections?: Json
          source_summary?: string | null
          staff_id: string
          status?: string
          steps?: Json
          updated_at?: string
        }
        Update: {
          active_seconds?: number
          completed_at?: string | null
          created_at?: string
          current_step?: number
          generated_at?: string | null
          id?: string
          organization_id?: string
          period?: string
          reflections?: Json
          source_summary?: string | null
          staff_id?: string
          status?: string
          steps?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ce_modules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ce_settings: {
        Row: {
          annual_goal_hours: number
          created_at: string
          demo_mode: boolean
          min_active_minutes: number
          organization_id: string
          updated_at: string
        }
        Insert: {
          annual_goal_hours?: number
          created_at?: string
          demo_mode?: boolean
          min_active_minutes?: number
          organization_id: string
          updated_at?: string
        }
        Update: {
          annual_goal_hours?: number
          created_at?: string
          demo_mode?: boolean
          min_active_minutes?: number
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ce_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      celebration_acknowledgements: {
        Row: {
          acknowledged_at: string
          event_id: string
          id: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string
          event_id: string
          id?: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string
          event_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "celebration_acknowledgements_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "celebration_events"
            referencedColumns: ["id"]
          },
        ]
      }
      celebration_events: {
        Row: {
          created_at: string
          event_key: string
          id: string
          organization_id: string
          payload: Json
          scope_user_id: string | null
          tier: number
        }
        Insert: {
          created_at?: string
          event_key: string
          id?: string
          organization_id: string
          payload?: Json
          scope_user_id?: string | null
          tier: number
        }
        Update: {
          created_at?: string
          event_key?: string
          id?: string
          organization_id?: string
          payload?: Json
          scope_user_id?: string | null
          tier?: number
        }
        Relationships: []
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
      client_approved_location_audit: {
        Row: {
          action: string
          actor_id: string | null
          client_id: string
          created_at: string
          id: string
          location_id: string | null
          organization_id: string
          snapshot: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          client_id: string
          created_at?: string
          id?: string
          location_id?: string | null
          organization_id: string
          snapshot: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          client_id?: string
          created_at?: string
          id?: string
          location_id?: string | null
          organization_id?: string
          snapshot?: Json
        }
        Relationships: []
      }
      client_approved_locations: {
        Row: {
          address: string | null
          client_id: string
          created_at: string
          created_by: string | null
          geofence_radius_feet: number
          id: string
          label: string
          latitude: number
          longitude: number
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          geofence_radius_feet?: number
          id?: string
          label: string
          latitude: number
          longitude: number
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          geofence_radius_feet?: number
          id?: string
          label?: string
          latitude?: number
          longitude?: number
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_approved_locations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_approved_locations_organization_id_fkey"
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
      client_billing_codes: {
        Row: {
          annual_unit_authorization: number
          client_id: string
          created_at: string
          id: string
          monthly_max_units: number | null
          organization_id: string
          provider_approver_email: string | null
          rate_per_unit: number
          rate_source: string | null
          rate_source_at: string | null
          rate_source_document_id: string | null
          rate_source_plan_number: string | null
          sce: string | null
          service_code: string
          service_end_date: string | null
          service_start_date: string | null
          unit_type: string
          updated_at: string
          weekly_cap_units: number | null
        }
        Insert: {
          annual_unit_authorization?: number
          client_id: string
          created_at?: string
          id?: string
          monthly_max_units?: number | null
          organization_id: string
          provider_approver_email?: string | null
          rate_per_unit?: number
          rate_source?: string | null
          rate_source_at?: string | null
          rate_source_document_id?: string | null
          rate_source_plan_number?: string | null
          sce?: string | null
          service_code: string
          service_end_date?: string | null
          service_start_date?: string | null
          unit_type?: string
          updated_at?: string
          weekly_cap_units?: number | null
        }
        Update: {
          annual_unit_authorization?: number
          client_id?: string
          created_at?: string
          id?: string
          monthly_max_units?: number | null
          organization_id?: string
          provider_approver_email?: string | null
          rate_per_unit?: number
          rate_source?: string | null
          rate_source_at?: string | null
          rate_source_document_id?: string | null
          rate_source_plan_number?: string | null
          sce?: string | null
          service_code?: string
          service_end_date?: string | null
          service_start_date?: string | null
          unit_type?: string
          updated_at?: string
          weekly_cap_units?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "client_billing_codes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_billing_codes_rate_source_document_id_fkey"
            columns: ["rate_source_document_id"]
            isOneToOne: false
            referencedRelation: "client_documents"
            referencedColumns: ["id"]
          },
        ]
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
      client_intake_completion: {
        Row: {
          client_id: string
          completed_by: string | null
          completed_date: string | null
          created_at: string
          evidence_document_id: string | null
          expires_at: string | null
          id: string
          notes: string | null
          organization_id: string
          requirement_id: string
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          completed_by?: string | null
          completed_date?: string | null
          created_at?: string
          evidence_document_id?: string | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          requirement_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          completed_by?: string | null
          completed_date?: string | null
          created_at?: string
          evidence_document_id?: string | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          requirement_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_intake_completion_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_intake_completion_evidence_document_id_fkey"
            columns: ["evidence_document_id"]
            isOneToOne: false
            referencedRelation: "nectar_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_intake_completion_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_intake_completion_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "nectar_requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      client_loan_entries: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          entry_date: string
          id: string
          kind: string
          loan_id: string
          note: string | null
          organization_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          kind: string
          loan_id: string
          note?: string | null
          organization_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          entry_date?: string
          id?: string
          kind?: string
          loan_id?: string
          note?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_loan_entries_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "client_loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_loan_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_loans: {
        Row: {
          advance_amount: number | null
          advance_cadence: string | null
          agreement_date: string
          borrower_name: string
          client_id: string
          created_at: string
          created_by: string | null
          direct_payment_amount: number | null
          direct_payment_cadence: string | null
          direct_payment_description: string | null
          direct_payment_due_day: string | null
          direct_payment_start_date: string | null
          id: string
          interest_notes: string | null
          interest_rate: number
          lender_name: string
          maturity_date: string | null
          notes: string | null
          organization_id: string
          purpose: string | null
          repayment_conditions: Json
          repayment_method: string | null
          signature_parties: Json
          status: string
          updated_at: string
          voluntary_ack: boolean
        }
        Insert: {
          advance_amount?: number | null
          advance_cadence?: string | null
          agreement_date?: string
          borrower_name: string
          client_id: string
          created_at?: string
          created_by?: string | null
          direct_payment_amount?: number | null
          direct_payment_cadence?: string | null
          direct_payment_description?: string | null
          direct_payment_due_day?: string | null
          direct_payment_start_date?: string | null
          id?: string
          interest_notes?: string | null
          interest_rate?: number
          lender_name: string
          maturity_date?: string | null
          notes?: string | null
          organization_id: string
          purpose?: string | null
          repayment_conditions?: Json
          repayment_method?: string | null
          signature_parties?: Json
          status?: string
          updated_at?: string
          voluntary_ack?: boolean
        }
        Update: {
          advance_amount?: number | null
          advance_cadence?: string | null
          agreement_date?: string
          borrower_name?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          direct_payment_amount?: number | null
          direct_payment_cadence?: string | null
          direct_payment_description?: string | null
          direct_payment_due_day?: string | null
          direct_payment_start_date?: string | null
          id?: string
          interest_notes?: string | null
          interest_rate?: number
          lender_name?: string
          maturity_date?: string | null
          notes?: string | null
          organization_id?: string
          purpose?: string | null
          repayment_conditions?: Json
          repayment_method?: string | null
          signature_parties?: Json
          status?: string
          updated_at?: string
          voluntary_ack?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "client_loans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_loans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      client_ratios: {
        Row: {
          client_id: string
          created_at: string
          effective_end: string | null
          effective_start: string
          id: string
          notes: string | null
          organization_id: string
          ratio_clients: number
          ratio_staff: number
          setting: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          effective_end?: string | null
          effective_start?: string
          id?: string
          notes?: string | null
          organization_id: string
          ratio_clients: number
          ratio_staff: number
          setting: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          effective_end?: string | null
          effective_start?: string
          id?: string
          notes?: string | null
          organization_id?: string
          ratio_clients?: number
          ratio_staff?: number
          setting?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_ratios_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_ratios_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_specific_trainings: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          attestation_statement: string
          client_id: string
          content: Json
          created_at: string
          id: string
          organization_id: string
          status: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          attestation_statement?: string
          client_id: string
          content?: Json
          created_at?: string
          id?: string
          organization_id: string
          status?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          attestation_statement?: string
          client_id?: string
          content?: Json
          created_at?: string
          id?: string
          organization_id?: string
          status?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_specific_trainings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_specific_trainings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_spending_log: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          id: string
          notes: string | null
          organization_id: string
          purpose: string
          receipt_path: string | null
          shift_id: string
          spent_at: string
          staff_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          client_id: string
          created_at?: string
          id?: string
          notes?: string | null
          organization_id: string
          purpose: string
          receipt_path?: string | null
          shift_id: string
          spent_at?: string
          staff_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          organization_id?: string
          purpose?: string
          receipt_path?: string | null
          shift_id?: string
          spent_at?: string
          staff_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_spending_log_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "evv_timesheets"
            referencedColumns: ["id"]
          },
        ]
      }
      client_weekly_targets: {
        Row: {
          client_id: string
          created_at: string
          id: string
          organization_id: string
          service_code: string
          source: string
          target_hours_per_week: number
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          organization_id: string
          service_code: string
          source?: string
          target_hours_per_week: number
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          service_code?: string
          source?: string
          target_hours_per_week?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_weekly_targets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_weekly_targets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          intake_status: string
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
          intake_status?: string
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
          intake_status?: string
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
          source: string
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
          source?: string
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
          source?: string
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
            referencedRelation: "org_member_directory"
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
          attestation_signed: boolean
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
          provider_id: string | null
          recorded_in: string
          scheduled_for: string
          scheduled_time_label: string | null
          signature_attestation: string | null
          signature_data_url: string | null
          staff_id: string | null
          staff_name: string | null
          status: string
          variance_note: string | null
        }
        Insert: {
          admin_review_notes?: string | null
          admin_reviewed?: boolean
          admin_reviewed_at?: string | null
          admin_reviewed_by?: string | null
          administered_at?: string | null
          attestation_signed?: boolean
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
          provider_id?: string | null
          recorded_in?: string
          scheduled_for: string
          scheduled_time_label?: string | null
          signature_attestation?: string | null
          signature_data_url?: string | null
          staff_id?: string | null
          staff_name?: string | null
          status: string
          variance_note?: string | null
        }
        Update: {
          admin_review_notes?: string | null
          admin_reviewed?: boolean
          admin_reviewed_at?: string | null
          admin_reviewed_by?: string | null
          administered_at?: string | null
          attestation_signed?: boolean
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
          provider_id?: string | null
          recorded_in?: string
          scheduled_for?: string
          scheduled_time_label?: string | null
          signature_attestation?: string | null
          signature_data_url?: string | null
          staff_id?: string | null
          staff_name?: string | null
          status?: string
          variance_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "emar_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
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
          matched_approved_location_id: string | null
          matched_approved_location_label: string | null
          nectar_drafted: boolean
          nectar_drafted_confirmed_at: string | null
          nectar_drafted_confirmed_by: string | null
          organization_id: string
          outside_geofence_reason: string | null
          raw_clock_in: string | null
          raw_clock_out: string | null
          reconciliation_attestation: string | null
          reconciliation_review_notes: string | null
          reconciliation_reviewed_at: string | null
          reconciliation_reviewed_by: string | null
          reconciliation_status: string | null
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
          matched_approved_location_id?: string | null
          matched_approved_location_label?: string | null
          nectar_drafted?: boolean
          nectar_drafted_confirmed_at?: string | null
          nectar_drafted_confirmed_by?: string | null
          organization_id: string
          outside_geofence_reason?: string | null
          raw_clock_in?: string | null
          raw_clock_out?: string | null
          reconciliation_attestation?: string | null
          reconciliation_review_notes?: string | null
          reconciliation_reviewed_at?: string | null
          reconciliation_reviewed_by?: string | null
          reconciliation_status?: string | null
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
          matched_approved_location_id?: string | null
          matched_approved_location_label?: string | null
          nectar_drafted?: boolean
          nectar_drafted_confirmed_at?: string | null
          nectar_drafted_confirmed_by?: string | null
          organization_id?: string
          outside_geofence_reason?: string | null
          raw_clock_in?: string | null
          raw_clock_out?: string | null
          reconciliation_attestation?: string | null
          reconciliation_review_notes?: string | null
          reconciliation_reviewed_at?: string | null
          reconciliation_reviewed_by?: string | null
          reconciliation_status?: string | null
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
            foreignKeyName: "evv_timesheets_matched_approved_location_id_fkey"
            columns: ["matched_approved_location_id"]
            isOneToOne: false
            referencedRelation: "client_approved_locations"
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
      exec_message_attachments: {
        Row: {
          created_at: string
          filename: string
          id: string
          message_id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
        }
        Insert: {
          created_at?: string
          filename: string
          id?: string
          message_id: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
        }
        Update: {
          created_at?: string
          filename?: string
          id?: string
          message_id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "exec_message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "exec_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      exec_message_recipients: {
        Row: {
          created_at: string
          id: string
          message_id: string
          organization_id: string
          read_at: string | null
          read_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          organization_id: string
          read_at?: string | null
          read_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          organization_id?: string
          read_at?: string | null
          read_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exec_message_recipients_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "exec_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exec_message_recipients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      exec_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          sender_user_id: string
          subject: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          sender_user_id: string
          subject: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          sender_user_id?: string
          subject?: string
        }
        Relationships: []
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
      extracted_fields: {
        Row: {
          confidence: number | null
          edited_at: string | null
          edited_by: string | null
          id: string
          import_job_id: string
          import_subject_id: string | null
          is_custom_attribute: boolean
          org_id: string
          original_target_field: string | null
          original_value: string | null
          provenance: string
          source_document_id: string | null
          source_snippet: string | null
          status: string
          target_field: string
          target_table: string
          value: string | null
        }
        Insert: {
          confidence?: number | null
          edited_at?: string | null
          edited_by?: string | null
          id?: string
          import_job_id: string
          import_subject_id?: string | null
          is_custom_attribute?: boolean
          org_id: string
          original_target_field?: string | null
          original_value?: string | null
          provenance?: string
          source_document_id?: string | null
          source_snippet?: string | null
          status?: string
          target_field: string
          target_table: string
          value?: string | null
        }
        Update: {
          confidence?: number | null
          edited_at?: string | null
          edited_by?: string | null
          id?: string
          import_job_id?: string
          import_subject_id?: string | null
          is_custom_attribute?: boolean
          org_id?: string
          original_target_field?: string | null
          original_value?: string | null
          provenance?: string
          source_document_id?: string | null
          source_snippet?: string | null
          status?: string
          target_field?: string
          target_table?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "extracted_fields_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracted_fields_import_subject_id_fkey"
            columns: ["import_subject_id"]
            isOneToOne: false
            referencedRelation: "import_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracted_fields_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extracted_fields_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "import_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      form_notifications: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          form_id: string
          id: string
          organization_id: string
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          form_id: string
          id?: string
          organization_id: string
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          form_id?: string
          id?: string
          organization_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_notifications_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      form_submissions: {
        Row: {
          answers: Json
          client_id: string | null
          created_at: string
          form_id: string
          id: string
          organization_id: string
          period_key: string | null
          shift_id: string | null
          status: string
          submitted_at: string
          submitted_by: string | null
          updated_at: string
        }
        Insert: {
          answers?: Json
          client_id?: string | null
          created_at?: string
          form_id: string
          id?: string
          organization_id: string
          period_key?: string | null
          shift_id?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string | null
          updated_at?: string
        }
        Update: {
          answers?: Json
          client_id?: string | null
          created_at?: string
          form_id?: string
          id?: string
          organization_id?: string
          period_key?: string | null
          shift_id?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "evv_timesheets"
            referencedColumns: ["id"]
          },
        ]
      }
      forms: {
        Row: {
          all_clients: boolean
          assigned_clients: string[]
          assigned_groups: string[]
          assigned_users: string[]
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          fields: Json
          frequency: string
          id: string
          name: string
          organization_id: string
          published_at: string | null
          schedule: Json
          settings: Json
          status: string
          updated_at: string
        }
        Insert: {
          all_clients?: boolean
          assigned_clients?: string[]
          assigned_groups?: string[]
          assigned_users?: string[]
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          fields?: Json
          frequency?: string
          id?: string
          name: string
          organization_id: string
          published_at?: string | null
          schedule?: Json
          settings?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          all_clients?: boolean
          assigned_clients?: string[]
          assigned_groups?: string[]
          assigned_users?: string[]
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          fields?: Json
          frequency?: string
          id?: string
          name?: string
          organization_id?: string
          published_at?: string | null
          schedule?: Json
          settings?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "forms_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      general_shifts: {
        Row: {
          category: string
          clock_in_timestamp: string
          clock_out_timestamp: string | null
          created_at: string
          id: string
          note: string | null
          organization_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          clock_in_timestamp?: string
          clock_out_timestamp?: string | null
          created_at?: string
          id?: string
          note?: string | null
          organization_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          clock_in_timestamp?: string
          clock_out_timestamp?: string | null
          created_at?: string
          id?: string
          note?: string | null
          organization_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "general_shifts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "general_shifts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "org_member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "general_shifts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      hhs_emar_logs_deprecated: {
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
      hive_base_template_versions: {
        Row: {
          changelog: Json
          created_at: string
          id: string
          is_current: boolean
          released_at: string
          released_by: string | null
          schema: Json
          summary: string
          title: string
          version: number
        }
        Insert: {
          changelog?: Json
          created_at?: string
          id?: string
          is_current?: boolean
          released_at?: string
          released_by?: string | null
          schema?: Json
          summary?: string
          title: string
          version: number
        }
        Update: {
          changelog?: Json
          created_at?: string
          id?: string
          is_current?: boolean
          released_at?: string
          released_by?: string | null
          schema?: Json
          summary?: string
          title?: string
          version?: number
        }
        Relationships: []
      }
      hive_executive_audit_log: {
        Row: {
          action: string
          actor_user_id: string
          created_at: string
          id: string
          summary: string | null
          target_org_id: string | null
        }
        Insert: {
          action: string
          actor_user_id: string
          created_at?: string
          id?: string
          summary?: string | null
          target_org_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string
          created_at?: string
          id?: string
          summary?: string | null
          target_org_id?: string | null
        }
        Relationships: []
      }
      hive_executives: {
        Row: {
          active: boolean
          granted_at: string
          granted_by: string | null
          id: string
          notes: string | null
          user_id: string
        }
        Insert: {
          active?: boolean
          granted_at?: string
          granted_by?: string | null
          id?: string
          notes?: string | null
          user_id: string
        }
        Update: {
          active?: boolean
          granted_at?: string
          granted_by?: string | null
          id?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: []
      }
      hive_platform_tickets: {
        Row: {
          affected_orgs: number
          audit: Json
          category: Database["public"]["Enums"]["hive_ticket_category"]
          created_at: string
          created_by: string | null
          dedupe_key: string | null
          detail: string
          detected_at: string
          event_kind: string | null
          event_ref: Json
          id: string
          resolution: Json
          severity: Database["public"]["Enums"]["hive_ticket_severity"]
          source: Database["public"]["Enums"]["hive_ticket_source"]
          status: Database["public"]["Enums"]["hive_ticket_status"]
          title: string
          triggering_org_id: string | null
          triggering_org_name: string | null
          updated_at: string
        }
        Insert: {
          affected_orgs?: number
          audit?: Json
          category?: Database["public"]["Enums"]["hive_ticket_category"]
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          detail?: string
          detected_at?: string
          event_kind?: string | null
          event_ref?: Json
          id?: string
          resolution?: Json
          severity?: Database["public"]["Enums"]["hive_ticket_severity"]
          source?: Database["public"]["Enums"]["hive_ticket_source"]
          status?: Database["public"]["Enums"]["hive_ticket_status"]
          title: string
          triggering_org_id?: string | null
          triggering_org_name?: string | null
          updated_at?: string
        }
        Update: {
          affected_orgs?: number
          audit?: Json
          category?: Database["public"]["Enums"]["hive_ticket_category"]
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          detail?: string
          detected_at?: string
          event_kind?: string | null
          event_ref?: Json
          id?: string
          resolution?: Json
          severity?: Database["public"]["Enums"]["hive_ticket_severity"]
          source?: Database["public"]["Enums"]["hive_ticket_source"]
          status?: Database["public"]["Enums"]["hive_ticket_status"]
          title?: string
          triggering_org_id?: string | null
          triggering_org_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hive_platform_tickets_triggering_org_id_fkey"
            columns: ["triggering_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      home_designations: {
        Row: {
          active: boolean
          created_at: string
          id: string
          label: string
          organization_id: string
          sort: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          label: string
          organization_id: string
          sort?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          label?: string
          organization_id?: string
          sort?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "home_designations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      home_staff_designations: {
        Row: {
          active: boolean
          created_at: string
          designation_id: string
          id: string
          organization_id: string
          position: Database["public"]["Enums"]["home_position"]
          staff_id: string
          team_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          designation_id: string
          id?: string
          organization_id: string
          position?: Database["public"]["Enums"]["home_position"]
          staff_id: string
          team_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          designation_id?: string
          id?: string
          organization_id?: string
          position?: Database["public"]["Enums"]["home_position"]
          staff_id?: string
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "home_staff_designations_designation_id_fkey"
            columns: ["designation_id"]
            isOneToOne: false
            referencedRelation: "home_designations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "home_staff_designations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "home_staff_designations_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "org_member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "home_staff_designations_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "home_staff_designations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_document_access_log: {
        Row: {
          action: string
          at: string
          hr_document_id: string | null
          id: string
          object_path: string | null
          organization_id: string
          staff_id: string
          viewer_id: string
        }
        Insert: {
          action: string
          at?: string
          hr_document_id?: string | null
          id?: string
          object_path?: string | null
          organization_id: string
          staff_id: string
          viewer_id: string
        }
        Update: {
          action?: string
          at?: string
          hr_document_id?: string | null
          id?: string
          object_path?: string | null
          organization_id?: string
          staff_id?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_document_access_log_hr_document_id_fkey"
            columns: ["hr_document_id"]
            isOneToOne: false
            referencedRelation: "hr_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_document_access_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_document_access_log_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "org_member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_document_access_log_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_document_access_log_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "org_member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_document_access_log_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_documents: {
        Row: {
          created_at: string
          document_kind: string
          file_name: string
          id: string
          mime_type: string | null
          object_path: string
          organization_id: string
          requirement_id: string | null
          size_bytes: number | null
          staff_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          document_kind: string
          file_name: string
          id?: string
          mime_type?: string | null
          object_path: string
          organization_id: string
          requirement_id?: string | null
          size_bytes?: number | null
          staff_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          document_kind?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          object_path?: string
          organization_id?: string
          requirement_id?: string | null
          size_bytes?: number | null
          staff_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_documents_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "nectar_requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_documents_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "org_member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_documents_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "org_member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hrc_committee_members: {
        Row: {
          active: boolean
          created_at: string
          id: string
          organization_id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          organization_id: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          organization_id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hrc_committee_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hrc_meetings: {
        Row: {
          attendees: string | null
          created_at: string
          created_by: string | null
          decisions: string | null
          id: string
          meeting_date: string | null
          minutes: string | null
          organization_id: string
          updated_at: string
        }
        Insert: {
          attendees?: string | null
          created_at?: string
          created_by?: string | null
          decisions?: string | null
          id?: string
          meeting_date?: string | null
          minutes?: string | null
          organization_id: string
          updated_at?: string
        }
        Update: {
          attendees?: string | null
          created_at?: string
          created_by?: string | null
          decisions?: string | null
          id?: string
          meeting_date?: string | null
          minutes?: string | null
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hrc_meetings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hrc_reviews: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          organization_id: string
          restriction_summary: string | null
          status: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          restriction_summary?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          restriction_summary?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hrc_reviews_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hrc_reviews_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      import_access_log: {
        Row: {
          action: string
          actor: string
          created_at: string
          details: Json
          id: string
          import_job_id: string
          target_org_id: string | null
        }
        Insert: {
          action: string
          actor: string
          created_at?: string
          details?: Json
          id?: string
          import_job_id: string
          target_org_id?: string | null
        }
        Update: {
          action?: string
          actor?: string
          created_at?: string
          details?: Json
          id?: string
          import_job_id?: string
          target_org_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_access_log_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_access_log_target_org_id_fkey"
            columns: ["target_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      import_audit: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          id: string
          import_job_id: string
          item: string
          org_id: string
          subject_id: string | null
          traces_to: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          id?: string
          import_job_id: string
          item: string
          org_id: string
          subject_id?: string | null
          traces_to?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          id?: string
          import_job_id?: string
          item?: string
          org_id?: string
          subject_id?: string | null
          traces_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_audit_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_audit_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_audit_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "import_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      import_cert_documents: {
        Row: {
          cert_key: string
          created_at: string
          expiry_date: string | null
          file_name: string | null
          id: string
          import_job_id: string
          import_subject_id: string
          notes: string | null
          org_id: string
          signed_off_at: string | null
          signed_off_by: string | null
          state: string
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          cert_key: string
          created_at?: string
          expiry_date?: string | null
          file_name?: string | null
          id?: string
          import_job_id: string
          import_subject_id: string
          notes?: string | null
          org_id: string
          signed_off_at?: string | null
          signed_off_by?: string | null
          state?: string
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          cert_key?: string
          created_at?: string
          expiry_date?: string | null
          file_name?: string | null
          id?: string
          import_job_id?: string
          import_subject_id?: string
          notes?: string | null
          org_id?: string
          signed_off_at?: string | null
          signed_off_by?: string | null
          state?: string
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_cert_documents_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_cert_documents_import_subject_id_fkey"
            columns: ["import_subject_id"]
            isOneToOne: false
            referencedRelation: "import_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_cert_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      import_documents: {
        Row: {
          checksum: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          id: string
          import_job_id: string
          mime_type: string | null
          org_id: string
          storage_path: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          checksum?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          import_job_id: string
          mime_type?: string | null
          org_id: string
          storage_path: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          checksum?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          import_job_id?: string
          mime_type?: string | null
          org_id?: string
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_documents_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      import_field_provenance: {
        Row: {
          created_at: string
          id: string
          import_job_id: string
          import_subject_id: string
          org_id: string
          provenance: string
          source_document_id: string | null
          source_snippet: string | null
          target_field: string
          target_record_id: string
          target_table: string
        }
        Insert: {
          created_at?: string
          id?: string
          import_job_id: string
          import_subject_id: string
          org_id: string
          provenance?: string
          source_document_id?: string | null
          source_snippet?: string | null
          target_field: string
          target_record_id: string
          target_table: string
        }
        Update: {
          created_at?: string
          id?: string
          import_job_id?: string
          import_subject_id?: string
          org_id?: string
          provenance?: string
          source_document_id?: string | null
          source_snippet?: string | null
          target_field?: string
          target_record_id?: string
          target_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_field_provenance_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_field_provenance_import_subject_id_fkey"
            columns: ["import_subject_id"]
            isOneToOne: false
            referencedRelation: "import_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_field_provenance_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_field_provenance_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "import_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          committed_at: string | null
          committed_by: string | null
          created_at: string
          created_by: string
          engagement_status: string
          id: string
          mode: string | null
          notes: string | null
          org_id: string
          provider_signoff_at: string | null
          provider_signoff_by: string | null
          quote_amount_cents: number | null
          scale: string | null
          source: string | null
          source_summary: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          target_org_id: string | null
        }
        Insert: {
          committed_at?: string | null
          committed_by?: string | null
          created_at?: string
          created_by?: string
          engagement_status?: string
          id?: string
          mode?: string | null
          notes?: string | null
          org_id: string
          provider_signoff_at?: string | null
          provider_signoff_by?: string | null
          quote_amount_cents?: number | null
          scale?: string | null
          source?: string | null
          source_summary?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          target_org_id?: string | null
        }
        Update: {
          committed_at?: string | null
          committed_by?: string | null
          created_at?: string
          created_by?: string
          engagement_status?: string
          id?: string
          mode?: string | null
          notes?: string | null
          org_id?: string
          provider_signoff_at?: string | null
          provider_signoff_by?: string | null
          quote_amount_cents?: number | null
          scale?: string | null
          source?: string | null
          source_summary?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          target_org_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_jobs_target_org_id_fkey"
            columns: ["target_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      import_nectar_questions: {
        Row: {
          answer: string | null
          answered_at: string | null
          answered_by: string | null
          context: string | null
          created_at: string
          id: string
          import_job_id: string
          import_subject_id: string | null
          org_id: string
          question: string
        }
        Insert: {
          answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          context?: string | null
          created_at?: string
          id?: string
          import_job_id: string
          import_subject_id?: string | null
          org_id: string
          question: string
        }
        Update: {
          answer?: string | null
          answered_at?: string | null
          answered_by?: string | null
          context?: string | null
          created_at?: string
          id?: string
          import_job_id?: string
          import_subject_id?: string | null
          org_id?: string
          question?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_nectar_questions_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_nectar_questions_import_subject_id_fkey"
            columns: ["import_subject_id"]
            isOneToOne: false
            referencedRelation: "import_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_nectar_questions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      import_subjects: {
        Row: {
          commit_error: string | null
          committed_at: string | null
          committed_record_id: string | null
          created_at: string
          display_name: string
          id: string
          import_job_id: string
          match_status: string
          matched_record_id: string | null
          org_id: string
          review_decision: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          subject_type: string
          updated_at: string
        }
        Insert: {
          commit_error?: string | null
          committed_at?: string | null
          committed_record_id?: string | null
          created_at?: string
          display_name: string
          id?: string
          import_job_id: string
          match_status?: string
          matched_record_id?: string | null
          org_id: string
          review_decision?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          subject_type: string
          updated_at?: string
        }
        Update: {
          commit_error?: string | null
          committed_at?: string | null
          committed_record_id?: string | null
          created_at?: string
          display_name?: string
          id?: string
          import_job_id?: string
          match_status?: string
          matched_record_id?: string | null
          org_id?: string
          review_decision?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          subject_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_subjects_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_subjects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "incident_reports_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_reports_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "org_member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_reports_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      location_coverage_requirements: {
        Row: {
          awake_required: boolean
          created_at: string
          day_of_week: number | null
          end_time: string
          id: string
          location_id: string
          notes: string | null
          organization_id: string
          required_staff_count: number
          start_time: string
          updated_at: string
        }
        Insert: {
          awake_required?: boolean
          created_at?: string
          day_of_week?: number | null
          end_time: string
          id?: string
          location_id: string
          notes?: string | null
          organization_id: string
          required_staff_count?: number
          start_time: string
          updated_at?: string
        }
        Update: {
          awake_required?: boolean
          created_at?: string
          day_of_week?: number | null
          end_time?: string
          id?: string
          location_id?: string
          notes?: string | null
          organization_id?: string
          required_staff_count?: number
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_coverage_requirements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_coverage_requirements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          active: boolean
          address: string | null
          created_at: string
          id: string
          legacy_home_designation_id: string | null
          name: string
          organization_id: string
          sort: number
          type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          created_at?: string
          id?: string
          legacy_home_designation_id?: string | null
          name: string
          organization_id: string
          sort?: number
          type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          created_at?: string
          id?: string
          legacy_home_designation_id?: string | null
          name?: string
          organization_id?: string
          sort?: number
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_legacy_home_designation_id_fkey"
            columns: ["legacy_home_designation_id"]
            isOneToOne: false
            referencedRelation: "home_designations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      nectar_attestations: {
        Row: {
          attested_at: string
          context: Json
          id: string
          organization_id: string
          scope: string
          scope_ref_id: string | null
          scope_ref_type: string | null
          statement: string
          user_display_name: string | null
          user_id: string
        }
        Insert: {
          attested_at?: string
          context?: Json
          id?: string
          organization_id: string
          scope: string
          scope_ref_id?: string | null
          scope_ref_type?: string | null
          statement: string
          user_display_name?: string | null
          user_id: string
        }
        Update: {
          attested_at?: string
          context?: Json
          id?: string
          organization_id?: string
          scope?: string
          scope_ref_id?: string | null
          scope_ref_type?: string | null
          statement?: string
          user_display_name?: string | null
          user_id?: string
        }
        Relationships: []
      }
      nectar_document_entities: {
        Row: {
          created_at: string
          document_id: string
          entity_id: string | null
          entity_kind: string
          entity_label: string | null
          id: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          document_id: string
          entity_id?: string | null
          entity_kind: string
          entity_label?: string | null
          id?: string
          organization_id: string
        }
        Update: {
          created_at?: string
          document_id?: string
          entity_id?: string | null
          entity_kind?: string
          entity_label?: string | null
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nectar_document_entities_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "nectar_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      nectar_documents: {
        Row: {
          assisted_setup_requested: boolean
          authoritative_kind: string | null
          category: string | null
          client_id: string | null
          created_at: string
          document_type: string
          effective_end: string | null
          effective_start: string | null
          external_ids: Json
          file_name: string
          file_size_bytes: number | null
          fiscal_year: string | null
          id: string
          is_authoritative_source: boolean
          is_current: boolean
          jurisdiction: string | null
          medicaid_id: string | null
          metadata: Json
          mime_type: string | null
          organization_id: string
          owner_kind: string
          parent_document_id: string | null
          parse_error: string | null
          parse_status: string
          parsed_at: string | null
          raw_text: string | null
          source: string | null
          staff_id: string | null
          storage_bucket: string
          storage_path: string
          tags: string[]
          title: string
          updated_at: string
          uploaded_by: string | null
          uploaded_by_name: string | null
          version: number
        }
        Insert: {
          assisted_setup_requested?: boolean
          authoritative_kind?: string | null
          category?: string | null
          client_id?: string | null
          created_at?: string
          document_type: string
          effective_end?: string | null
          effective_start?: string | null
          external_ids?: Json
          file_name: string
          file_size_bytes?: number | null
          fiscal_year?: string | null
          id?: string
          is_authoritative_source?: boolean
          is_current?: boolean
          jurisdiction?: string | null
          medicaid_id?: string | null
          metadata?: Json
          mime_type?: string | null
          organization_id: string
          owner_kind: string
          parent_document_id?: string | null
          parse_error?: string | null
          parse_status?: string
          parsed_at?: string | null
          raw_text?: string | null
          source?: string | null
          staff_id?: string | null
          storage_bucket?: string
          storage_path: string
          tags?: string[]
          title: string
          updated_at?: string
          uploaded_by?: string | null
          uploaded_by_name?: string | null
          version?: number
        }
        Update: {
          assisted_setup_requested?: boolean
          authoritative_kind?: string | null
          category?: string | null
          client_id?: string | null
          created_at?: string
          document_type?: string
          effective_end?: string | null
          effective_start?: string | null
          external_ids?: Json
          file_name?: string
          file_size_bytes?: number | null
          fiscal_year?: string | null
          id?: string
          is_authoritative_source?: boolean
          is_current?: boolean
          jurisdiction?: string | null
          medicaid_id?: string | null
          metadata?: Json
          mime_type?: string | null
          organization_id?: string
          owner_kind?: string
          parent_document_id?: string | null
          parse_error?: string | null
          parse_status?: string
          parsed_at?: string | null
          raw_text?: string | null
          source?: string | null
          staff_id?: string | null
          storage_bucket?: string
          storage_path?: string
          tags?: string[]
          title?: string
          updated_at?: string
          uploaded_by?: string | null
          uploaded_by_name?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "nectar_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nectar_documents_parent_document_id_fkey"
            columns: ["parent_document_id"]
            isOneToOne: false
            referencedRelation: "nectar_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      nectar_extracted_fields: {
        Row: {
          confidence: number | null
          created_at: string
          document_id: string
          field_group: string | null
          field_key: string
          id: string
          organization_id: string
          override_value: Json | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_locator: string | null
          status: string
          updated_at: string
          value_date: string | null
          value_json: Json | null
          value_number: number | null
          value_text: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          document_id: string
          field_group?: string | null
          field_key: string
          id?: string
          organization_id: string
          override_value?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_locator?: string | null
          status?: string
          updated_at?: string
          value_date?: string | null
          value_json?: Json | null
          value_number?: number | null
          value_text?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          document_id?: string
          field_group?: string | null
          field_key?: string
          id?: string
          organization_id?: string
          override_value?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_locator?: string | null
          status?: string
          updated_at?: string
          value_date?: string | null
          value_json?: Json | null
          value_number?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nectar_extracted_fields_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "nectar_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      nectar_guide_tasks: {
        Row: {
          created_at: string
          current_step: number
          guide_id: string
          id: string
          organization_id: string
          position: number
          status: string
          steps: Json
          title: string
          updated_at: string
          user_id: string
          why: string | null
        }
        Insert: {
          created_at?: string
          current_step?: number
          guide_id: string
          id?: string
          organization_id: string
          position?: number
          status?: string
          steps?: Json
          title: string
          updated_at?: string
          user_id: string
          why?: string | null
        }
        Update: {
          created_at?: string
          current_step?: number
          guide_id?: string
          id?: string
          organization_id?: string
          position?: number
          status?: string
          steps?: Json
          title?: string
          updated_at?: string
          user_id?: string
          why?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nectar_guide_tasks_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "nectar_guides"
            referencedColumns: ["id"]
          },
        ]
      }
      nectar_guides: {
        Row: {
          created_at: string
          goal: string
          id: string
          organization_id: string
          status: string
          summary: string | null
          surface: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          goal: string
          id?: string
          organization_id: string
          status?: string
          summary?: string | null
          surface?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          goal?: string
          id?: string
          organization_id?: string
          status?: string
          summary?: string | null
          surface?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      nectar_report_runs: {
        Row: {
          csv_url: string | null
          error: string | null
          id: string
          ran_at: string
          row_count: number | null
          saved_report_id: string
        }
        Insert: {
          csv_url?: string | null
          error?: string | null
          id?: string
          ran_at?: string
          row_count?: number | null
          saved_report_id: string
        }
        Update: {
          csv_url?: string | null
          error?: string | null
          id?: string
          ran_at?: string
          row_count?: number | null
          saved_report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nectar_report_runs_saved_report_id_fkey"
            columns: ["saved_report_id"]
            isOneToOne: false
            referencedRelation: "nectar_saved_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      nectar_report_schedules: {
        Row: {
          active: boolean
          cadence: Database["public"]["Enums"]["report_cadence"]
          created_at: string
          day_of_month: number | null
          day_of_week: number | null
          deliver_email: boolean
          deliver_save: boolean
          hour: number
          id: string
          last_run_at: string | null
          next_run_at: string | null
          recipients: string[]
          saved_report_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          cadence: Database["public"]["Enums"]["report_cadence"]
          created_at?: string
          day_of_month?: number | null
          day_of_week?: number | null
          deliver_email?: boolean
          deliver_save?: boolean
          hour?: number
          id?: string
          last_run_at?: string | null
          next_run_at?: string | null
          recipients?: string[]
          saved_report_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          cadence?: Database["public"]["Enums"]["report_cadence"]
          created_at?: string
          day_of_month?: number | null
          day_of_week?: number | null
          deliver_email?: boolean
          deliver_save?: boolean
          hour?: number
          id?: string
          last_run_at?: string | null
          next_run_at?: string | null
          recipients?: string[]
          saved_report_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nectar_report_schedules_saved_report_id_fkey"
            columns: ["saved_report_id"]
            isOneToOne: false
            referencedRelation: "nectar_saved_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      nectar_requirement_approval_events: {
        Row: {
          action: string
          actor_label: string | null
          actor_user_id: string | null
          created_at: string
          id: string
          organization_id: string
          reason: string | null
          requirement_id: string
          stage: string
        }
        Insert: {
          action: string
          actor_label?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          organization_id: string
          reason?: string | null
          requirement_id: string
          stage: string
        }
        Update: {
          action?: string
          actor_label?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          reason?: string | null
          requirement_id?: string
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "nectar_requirement_approval_events_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "nectar_requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      nectar_requirement_mappings: {
        Row: {
          cadence: string | null
          confirmed: boolean
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          id: string
          jurisdiction: string | null
          metadata: Json
          organization_id: string
          proposed_by: string
          rationale: string | null
          requirement_id: string
          scope_kind: string
          scope_value: string | null
          source_excerpt: string | null
          updated_at: string
        }
        Insert: {
          cadence?: string | null
          confirmed?: boolean
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          jurisdiction?: string | null
          metadata?: Json
          organization_id: string
          proposed_by?: string
          rationale?: string | null
          requirement_id: string
          scope_kind: string
          scope_value?: string | null
          source_excerpt?: string | null
          updated_at?: string
        }
        Update: {
          cadence?: string | null
          confirmed?: boolean
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          id?: string
          jurisdiction?: string | null
          metadata?: Json
          organization_id?: string
          proposed_by?: string
          rationale?: string | null
          requirement_id?: string
          scope_kind?: string
          scope_value?: string | null
          source_excerpt?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nectar_requirement_mappings_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "nectar_requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      nectar_requirements: {
        Row: {
          applies_to: string | null
          approval_state: string | null
          category: string | null
          created_at: string
          description: string | null
          id: string
          jurisdiction: string | null
          metadata: Json
          organization_id: string
          origin: string
          requirement_key: string
          review_status: string
          source_citation: string | null
          source_document_id: string | null
          title: string
          updated_at: string
          verified: boolean
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          applies_to?: string | null
          approval_state?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          jurisdiction?: string | null
          metadata?: Json
          organization_id: string
          origin?: string
          requirement_key: string
          review_status?: string
          source_citation?: string | null
          source_document_id?: string | null
          title: string
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          applies_to?: string | null
          approval_state?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          jurisdiction?: string | null
          metadata?: Json
          organization_id?: string
          origin?: string
          requirement_key?: string
          review_status?: string
          source_citation?: string | null
          source_document_id?: string | null
          title?: string
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nectar_requirements_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "nectar_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      nectar_saved_reports: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string
          owner_user_id: string
          pinned: boolean
          plan: Json | null
          prompt: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id: string
          owner_user_id: string
          pinned?: boolean
          plan?: Json | null
          prompt: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          owner_user_id?: string
          pinned?: boolean
          plan?: Json | null
          prompt?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nectar_saved_reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          next_remind_at: string | null
          organization_id: string
          read_at: string | null
          recipient_role: string
          recipient_user_id: string | null
          recurrence_interval: string | null
          recurrence_key: string | null
          related_id: string | null
          related_type: string | null
          resolved_at: string | null
          resolved_by: string | null
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
          next_remind_at?: string | null
          organization_id: string
          read_at?: string | null
          recipient_role?: string
          recipient_user_id?: string | null
          recurrence_interval?: string | null
          recurrence_key?: string | null
          related_id?: string | null
          related_type?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
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
          next_remind_at?: string | null
          organization_id?: string
          read_at?: string | null
          recipient_role?: string
          recipient_user_id?: string | null
          recurrence_interval?: string | null
          recurrence_key?: string | null
          related_id?: string | null
          related_type?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          title?: string
          type?: string
          urgency?: string
        }
        Relationships: []
      }
      org_celebration_settings: {
        Row: {
          enabled: boolean
          organization_id: string
          tier1_enabled: boolean
          tier2_enabled: boolean
          tier3_enabled: boolean
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          organization_id: string
          tier1_enabled?: boolean
          tier2_enabled?: boolean
          tier3_enabled?: boolean
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          organization_id?: string
          tier1_enabled?: boolean
          tier2_enabled?: boolean
          tier3_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      org_loan_attestations: {
        Row: {
          attestation_text: string
          attestation_version: string
          attested_at: string
          attested_by: string
          created_at: string
          id: string
          organization_id: string
        }
        Insert: {
          attestation_text: string
          attestation_version: string
          attested_at?: string
          attested_by: string
          created_at?: string
          id?: string
          organization_id: string
        }
        Update: {
          attestation_text?: string
          attestation_version?: string
          attested_at?: string
          attested_by?: string
          created_at?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_loan_attestations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_loan_settings: {
        Row: {
          active_attestation_id: string | null
          created_at: string
          enabled: boolean
          enabled_at: string | null
          enabled_by: string | null
          organization_id: string
          updated_at: string
        }
        Insert: {
          active_attestation_id?: string | null
          created_at?: string
          enabled?: boolean
          enabled_at?: string | null
          enabled_by?: string | null
          organization_id: string
          updated_at?: string
        }
        Update: {
          active_attestation_id?: string | null
          created_at?: string
          enabled?: boolean
          enabled_at?: string | null
          enabled_by?: string | null
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_loan_settings_active_attestation_id_fkey"
            columns: ["active_attestation_id"]
            isOneToOne: false
            referencedRelation: "org_loan_attestations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_loan_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_shift_behavior_settings: {
        Row: {
          enabled: boolean
          organization_id: string
          ot_threshold_hours: number
          rule_settings: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          organization_id: string
          ot_threshold_hours?: number
          rule_settings?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          organization_id?: string
          ot_threshold_hours?: number
          rule_settings?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_shift_behavior_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_subscriptions: {
        Row: {
          canceled_at: string | null
          created_at: string
          id: string
          mrr_cents: number
          notes: string | null
          organization_id: string
          plan: Database["public"]["Enums"]["sub_plan"]
          renewal_date: string | null
          started_at: string
          status: Database["public"]["Enums"]["sub_status"]
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          canceled_at?: string | null
          created_at?: string
          id?: string
          mrr_cents?: number
          notes?: string | null
          organization_id: string
          plan?: Database["public"]["Enums"]["sub_plan"]
          renewal_date?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["sub_status"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          canceled_at?: string | null
          created_at?: string
          id?: string
          mrr_cents?: number
          notes?: string | null
          organization_id?: string
          plan?: Database["public"]["Enums"]["sub_plan"]
          renewal_date?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["sub_status"]
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_support_tickets: {
        Row: {
          assignee_user_id: string | null
          body: string | null
          conversation: Json
          created_at: string
          id: string
          opened_by: string
          organization_id: string
          resolved_at: string | null
          severity: Database["public"]["Enums"]["ticket_severity"]
          source: string
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at: string
        }
        Insert: {
          assignee_user_id?: string | null
          body?: string | null
          conversation?: Json
          created_at?: string
          id?: string
          opened_by: string
          organization_id: string
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["ticket_severity"]
          source?: string
          status?: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at?: string
        }
        Update: {
          assignee_user_id?: string | null
          body?: string | null
          conversation?: Json
          created_at?: string
          id?: string
          opened_by?: string
          organization_id?: string
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["ticket_severity"]
          source?: string
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_support_tickets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          active: boolean
          created_at: string
          id: string
          is_company_executive: boolean
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
          is_company_executive?: boolean
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
          is_company_executive?: boolean
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
          additional_state_codes: string[]
          created_at: string
          created_by: string | null
          id: string
          is_demo: boolean
          logo_url: string | null
          name: string
          slug: string
          state_code: string | null
          updated_at: string
        }
        Insert: {
          additional_state_codes?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          is_demo?: boolean
          logo_url?: string | null
          name: string
          slug: string
          state_code?: string | null
          updated_at?: string
        }
        Update: {
          additional_state_codes?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          is_demo?: boolean
          logo_url?: string | null
          name?: string
          slug?: string
          state_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_state_code_fkey"
            columns: ["state_code"]
            isOneToOne: false
            referencedRelation: "platform_states"
            referencedColumns: ["code"]
          },
        ]
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
      platform_states: {
        Row: {
          code: string
          created_at: string
          is_reference: boolean
          name: string
          notes: string | null
          regulator_label: string | null
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          is_reference?: boolean
          name: string
          notes?: string | null
          regulator_label?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          is_reference?: boolean
          name?: string
          notes?: string | null
          regulator_label?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_status: string
          agency_name: string | null
          bc_role: Database["public"]["Enums"]["bc_code"] | null
          ce_suggested_topics: string[]
          created_at: string
          daily_rate: number | null
          date_of_birth: string | null
          department: string | null
          email: string | null
          employee_id: string | null
          end_date: string | null
          evv_consent_timestamp: string | null
          evv_gps_consent_status: string
          first_name: string | null
          full_name: string | null
          hire_date: string | null
          home_address: string | null
          hourly_rate: number | null
          id: string
          is_active: boolean
          last_name: string | null
          must_change_password: boolean
          position: string | null
          ssn_last4: string | null
          staff_type_keys: string[]
          start_date: string | null
          system_role: string
          team_id: string | null
          tenant_id: string | null
          username: string | null
          worker_type: string
        }
        Insert: {
          account_status?: string
          agency_name?: string | null
          bc_role?: Database["public"]["Enums"]["bc_code"] | null
          ce_suggested_topics?: string[]
          created_at?: string
          daily_rate?: number | null
          date_of_birth?: string | null
          department?: string | null
          email?: string | null
          employee_id?: string | null
          end_date?: string | null
          evv_consent_timestamp?: string | null
          evv_gps_consent_status?: string
          first_name?: string | null
          full_name?: string | null
          hire_date?: string | null
          home_address?: string | null
          hourly_rate?: number | null
          id: string
          is_active?: boolean
          last_name?: string | null
          must_change_password?: boolean
          position?: string | null
          ssn_last4?: string | null
          staff_type_keys?: string[]
          start_date?: string | null
          system_role?: string
          team_id?: string | null
          tenant_id?: string | null
          username?: string | null
          worker_type?: string
        }
        Update: {
          account_status?: string
          agency_name?: string | null
          bc_role?: Database["public"]["Enums"]["bc_code"] | null
          ce_suggested_topics?: string[]
          created_at?: string
          daily_rate?: number | null
          date_of_birth?: string | null
          department?: string | null
          email?: string | null
          employee_id?: string | null
          end_date?: string | null
          evv_consent_timestamp?: string | null
          evv_gps_consent_status?: string
          first_name?: string | null
          full_name?: string | null
          hire_date?: string | null
          home_address?: string | null
          hourly_rate?: number | null
          id?: string
          is_active?: boolean
          last_name?: string | null
          must_change_password?: boolean
          position?: string | null
          ssn_last4?: string | null
          staff_type_keys?: string[]
          start_date?: string | null
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
      provider_authorized_codes: {
        Row: {
          added_by: string | null
          carve_out: boolean
          code: string
          created_at: string
          id: string
          kind: string
          label: string | null
          notes: string | null
          organization_id: string
          sort: number
          source: string
          source_document_id: string | null
          status: string
          unit: string
          updated_at: string
        }
        Insert: {
          added_by?: string | null
          carve_out?: boolean
          code: string
          created_at?: string
          id?: string
          kind?: string
          label?: string | null
          notes?: string | null
          organization_id: string
          sort?: number
          source?: string
          source_document_id?: string | null
          status?: string
          unit?: string
          updated_at?: string
        }
        Update: {
          added_by?: string | null
          carve_out?: boolean
          code?: string
          created_at?: string
          id?: string
          kind?: string
          label?: string | null
          notes?: string | null
          organization_id?: string
          sort?: number
          source?: string
          source_document_id?: string | null
          status?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_authorized_codes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_authorized_codes_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "nectar_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_ledger_entries: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string | null
          id: string
          is_estimate: boolean
          label: string
          note: string | null
          organization_id: string
          period_month: number
          period_year: number
          updated_at: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_estimate?: boolean
          label: string
          note?: string | null
          organization_id: string
          period_month: number
          period_year: number
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_estimate?: boolean
          label?: string
          note?: string | null
          organization_id?: string
          period_month?: number
          period_year?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_ledger_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      provider_training_modules: {
        Row: {
          attestation_statement: string
          client_id: string | null
          created_at: string
          created_by: string | null
          est_min: number
          id: string
          intro: string | null
          kind: Database["public"]["Enums"]["provider_training_kind"]
          organization_id: string
          person_label: string | null
          source_doc_name: string | null
          status: Database["public"]["Enums"]["provider_training_status"]
          steps: Json
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          attestation_statement: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          est_min?: number
          id?: string
          intro?: string | null
          kind: Database["public"]["Enums"]["provider_training_kind"]
          organization_id: string
          person_label?: string | null
          source_doc_name?: string | null
          status?: Database["public"]["Enums"]["provider_training_status"]
          steps?: Json
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          attestation_statement?: string
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          est_min?: number
          id?: string
          intro?: string | null
          kind?: Database["public"]["Enums"]["provider_training_kind"]
          organization_id?: string
          person_label?: string | null
          source_doc_name?: string | null
          status?: Database["public"]["Enums"]["provider_training_status"]
          steps?: Json
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "provider_training_modules_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_training_modules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      provisioning_plan: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          attributed_to_admin: boolean
          committed_at: string | null
          id: string
          import_job_id: string
          org_id: string
          override_note: string | null
          planned_action: string
          reason: string | null
          rule_id: string | null
          state: string
          subject_id: string | null
          target_module: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          attributed_to_admin?: boolean
          committed_at?: string | null
          id?: string
          import_job_id: string
          org_id: string
          override_note?: string | null
          planned_action: string
          reason?: string | null
          rule_id?: string | null
          state?: string
          subject_id?: string | null
          target_module: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          attributed_to_admin?: boolean
          committed_at?: string | null
          id?: string
          import_job_id?: string
          org_id?: string
          override_note?: string | null
          planned_action?: string
          reason?: string | null
          rule_id?: string | null
          state?: string
          subject_id?: string | null
          target_module?: string
        }
        Relationships: [
          {
            foreignKeyName: "provisioning_plan_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provisioning_plan_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provisioning_plan_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "provisioning_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provisioning_plan_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "import_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      provisioning_rules: {
        Row: {
          action_type: string
          applies_to: string
          created_at: string
          created_by: string
          default_state: string
          id: string
          is_active: boolean
          notes: string | null
          org_id: string
          target_module: string
          trigger_type: string
          trigger_value: string
        }
        Insert: {
          action_type: string
          applies_to?: string
          created_at?: string
          created_by?: string
          default_state?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          org_id: string
          target_module: string
          trigger_type: string
          trigger_value: string
        }
        Update: {
          action_type?: string
          applies_to?: string
          created_at?: string
          created_by?: string
          default_state?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          org_id?: string
          target_module?: string
          trigger_type?: string
          trigger_value?: string
        }
        Relationships: [
          {
            foreignKeyName: "provisioning_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          callout_reason: string | null
          client_id: string
          code_id: string | null
          created_at: string
          created_by: string | null
          created_from: string | null
          ends_at: string
          id: string
          is_awake_overnight: boolean | null
          is_recurring: boolean
          job_code: string | null
          location_id: string | null
          notes: string | null
          organization_id: string
          override_reason: string | null
          parent_shift_id: string | null
          published: boolean
          recurrence_end_date: string | null
          recurrence_rule: string | null
          service_code: string | null
          shift_type: string
          staff_id: string
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          callout_reason?: string | null
          client_id: string
          code_id?: string | null
          created_at?: string
          created_by?: string | null
          created_from?: string | null
          ends_at: string
          id?: string
          is_awake_overnight?: boolean | null
          is_recurring?: boolean
          job_code?: string | null
          location_id?: string | null
          notes?: string | null
          organization_id: string
          override_reason?: string | null
          parent_shift_id?: string | null
          published?: boolean
          recurrence_end_date?: string | null
          recurrence_rule?: string | null
          service_code?: string | null
          shift_type?: string
          staff_id: string
          starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          callout_reason?: string | null
          client_id?: string
          code_id?: string | null
          created_at?: string
          created_by?: string | null
          created_from?: string | null
          ends_at?: string
          id?: string
          is_awake_overnight?: boolean | null
          is_recurring?: boolean
          job_code?: string | null
          location_id?: string | null
          notes?: string | null
          organization_id?: string
          override_reason?: string | null
          parent_shift_id?: string | null
          published?: boolean
          recurrence_end_date?: string | null
          recurrence_rule?: string | null
          service_code?: string | null
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
            foreignKeyName: "scheduled_shifts_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "provider_authorized_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_shifts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
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
            foreignKeyName: "scheduled_shifts_parent_shift_id_fkey"
            columns: ["parent_shift_id"]
            isOneToOne: false
            referencedRelation: "scheduled_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_shifts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "org_member_directory"
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
      service_codes: {
        Row: {
          carve_out: boolean
          category: string
          code: string
          created_at: string
          id: string
          is_active: boolean
          is_living_arrangement: boolean
          name: string | null
          organization_id: string
          requires_evv: boolean
          requires_schedule: boolean
          scheduling_behavior: string
          unit: string
          updated_at: string
        }
        Insert: {
          carve_out?: boolean
          category: string
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_living_arrangement?: boolean
          name?: string | null
          organization_id: string
          requires_evv?: boolean
          requires_schedule?: boolean
          scheduling_behavior: string
          unit: string
          updated_at?: string
        }
        Update: {
          carve_out?: boolean
          category?: string
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_living_arrangement?: boolean
          name?: string | null
          organization_id?: string
          requires_evv?: boolean
          requires_schedule?: boolean
          scheduling_behavior?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_codes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_behavior_observations: {
        Row: {
          antecedent_context: string | null
          behavior_counts: Json
          behaviors_observed: boolean
          client_id: string
          created_at: string
          id: string
          intervention_response: string | null
          objective_description: string | null
          observed_at: string
          organization_id: string
          positives: string | null
          reportable_incident: boolean
          shift_id: string
          staff_id: string
          target_behaviors: Json
          trend_vs_recent: string | null
          updated_at: string
        }
        Insert: {
          antecedent_context?: string | null
          behavior_counts?: Json
          behaviors_observed: boolean
          client_id: string
          created_at?: string
          id?: string
          intervention_response?: string | null
          objective_description?: string | null
          observed_at?: string
          organization_id: string
          positives?: string | null
          reportable_incident?: boolean
          shift_id: string
          staff_id: string
          target_behaviors?: Json
          trend_vs_recent?: string | null
          updated_at?: string
        }
        Update: {
          antecedent_context?: string | null
          behavior_counts?: Json
          behaviors_observed?: boolean
          client_id?: string
          created_at?: string
          id?: string
          intervention_response?: string | null
          objective_description?: string | null
          observed_at?: string
          organization_id?: string
          positives?: string | null
          reportable_incident?: boolean
          shift_id?: string
          staff_id?: string
          target_behaviors?: Json
          trend_vs_recent?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_behavior_observations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_behavior_observations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_behavior_observations_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: true
            referencedRelation: "evv_timesheets"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_callouts: {
        Row: {
          coverage_locked_at: string | null
          coverage_staff_id: string | null
          created_at: string
          id: string
          manager_acknowledged_at: string | null
          manager_acknowledged_by: string | null
          organization_id: string
          reason: string | null
          resolved_at: string | null
          scheduled_shift_id: string
          staff_id: string
          status: string
          updated_at: string
          urgency: string
        }
        Insert: {
          coverage_locked_at?: string | null
          coverage_staff_id?: string | null
          created_at?: string
          id?: string
          manager_acknowledged_at?: string | null
          manager_acknowledged_by?: string | null
          organization_id: string
          reason?: string | null
          resolved_at?: string | null
          scheduled_shift_id: string
          staff_id: string
          status?: string
          updated_at?: string
          urgency?: string
        }
        Update: {
          coverage_locked_at?: string | null
          coverage_staff_id?: string | null
          created_at?: string
          id?: string
          manager_acknowledged_at?: string | null
          manager_acknowledged_by?: string | null
          organization_id?: string
          reason?: string | null
          resolved_at?: string | null
          scheduled_shift_id?: string
          staff_id?: string
          status?: string
          updated_at?: string
          urgency?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_callouts_coverage_staff_id_fkey"
            columns: ["coverage_staff_id"]
            isOneToOne: false
            referencedRelation: "org_member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_callouts_coverage_staff_id_fkey"
            columns: ["coverage_staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_callouts_manager_acknowledged_by_fkey"
            columns: ["manager_acknowledged_by"]
            isOneToOne: false
            referencedRelation: "org_member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_callouts_manager_acknowledged_by_fkey"
            columns: ["manager_acknowledged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_callouts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_callouts_scheduled_shift_id_fkey"
            columns: ["scheduled_shift_id"]
            isOneToOne: false
            referencedRelation: "scheduled_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_callouts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "org_member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_callouts_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_completeness_flags: {
        Row: {
          client_id: string | null
          created_at: string
          dismissal_reason: string | null
          fix_route: string | null
          flag_type: string
          id: string
          message: string
          organization_id: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          shift_id: string
          staff_id: string
          status: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          dismissal_reason?: string | null
          fix_route?: string | null
          flag_type: string
          id?: string
          message: string
          organization_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          shift_id: string
          staff_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          dismissal_reason?: string | null
          fix_route?: string | null
          flag_type?: string
          id?: string
          message?: string
          organization_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          shift_id?: string
          staff_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_completeness_flags_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "evv_timesheets"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_mar_entries: {
        Row: {
          administered_at: string
          client_id: string
          client_medication_id: string
          created_at: string
          evv_timesheet_id: string | null
          id: string
          notes: string | null
          organization_id: string
          scheduled_shift_id: string | null
          scheduled_time: string | null
          staff_id: string
          status: string
          updated_at: string
        }
        Insert: {
          administered_at?: string
          client_id: string
          client_medication_id: string
          created_at?: string
          evv_timesheet_id?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          scheduled_shift_id?: string | null
          scheduled_time?: string | null
          staff_id: string
          status: string
          updated_at?: string
        }
        Update: {
          administered_at?: string
          client_id?: string
          client_medication_id?: string
          created_at?: string
          evv_timesheet_id?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          scheduled_shift_id?: string | null
          scheduled_time?: string | null
          staff_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_mar_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_mar_entries_client_medication_id_fkey"
            columns: ["client_medication_id"]
            isOneToOne: false
            referencedRelation: "client_medications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_mar_entries_evv_timesheet_id_fkey"
            columns: ["evv_timesheet_id"]
            isOneToOne: false
            referencedRelation: "evv_timesheets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_mar_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_mar_entries_scheduled_shift_id_fkey"
            columns: ["scheduled_shift_id"]
            isOneToOne: false
            referencedRelation: "scheduled_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_mar_entries_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "org_member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_mar_entries_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_reports: {
        Row: {
          client_id: string
          code_id: string | null
          created_at: string
          evv_timesheet_id: string | null
          goals_worked: Json
          id: string
          incidents: Json
          narrative: string | null
          organization_id: string
          scheduled_shift_id: string | null
          staff_id: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          code_id?: string | null
          created_at?: string
          evv_timesheet_id?: string | null
          goals_worked?: Json
          id?: string
          incidents?: Json
          narrative?: string | null
          organization_id: string
          scheduled_shift_id?: string | null
          staff_id: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          code_id?: string | null
          created_at?: string
          evv_timesheet_id?: string | null
          goals_worked?: Json
          id?: string
          incidents?: Json
          narrative?: string | null
          organization_id?: string
          scheduled_shift_id?: string | null
          staff_id?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_reports_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_reports_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "provider_authorized_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_reports_evv_timesheet_id_fkey"
            columns: ["evv_timesheet_id"]
            isOneToOne: false
            referencedRelation: "evv_timesheets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_reports_scheduled_shift_id_fkey"
            columns: ["scheduled_shift_id"]
            isOneToOne: false
            referencedRelation: "scheduled_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_reports_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "org_member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_reports_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_swap_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          from_staff_id: string
          id: string
          note: string | null
          organization_id: string
          shift_id: string
          status: string
          to_staff_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          from_staff_id: string
          id?: string
          note?: string | null
          organization_id: string
          shift_id: string
          status?: string
          to_staff_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          from_staff_id?: string
          id?: string
          note?: string | null
          organization_id?: string
          shift_id?: string
          status?: string
          to_staff_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_swap_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "org_member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_swap_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_swap_requests_from_staff_id_fkey"
            columns: ["from_staff_id"]
            isOneToOne: false
            referencedRelation: "org_member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_swap_requests_from_staff_id_fkey"
            columns: ["from_staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_swap_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_swap_requests_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "scheduled_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_swap_requests_to_staff_id_fkey"
            columns: ["to_staff_id"]
            isOneToOne: false
            referencedRelation: "org_member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_swap_requests_to_staff_id_fkey"
            columns: ["to_staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_templates: {
        Row: {
          active: boolean
          color: string | null
          created_at: string
          end_time: string
          id: string
          name: string
          organization_id: string
          sort: number
          start_time: string
          team_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          color?: string | null
          created_at?: string
          end_time: string
          id?: string
          name: string
          organization_id: string
          sort?: number
          start_time: string
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          color?: string | null
          created_at?: string
          end_time?: string
          id?: string
          name?: string
          organization_id?: string
          sort?: number
          start_time?: string
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_templates_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
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
          service_codes: string[] | null
          staff_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_group_home_assignment?: boolean
          organization_id: string
          service_codes?: string[] | null
          staff_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_group_home_assignment?: boolean
          organization_id?: string
          service_codes?: string[] | null
          staff_id?: string
        }
        Relationships: []
      }
      staff_checklist_completion: {
        Row: {
          auto_checked_at: string | null
          client_id: string | null
          completed_by: string | null
          completed_date: string | null
          created_at: string
          evidence_document_id: string | null
          expires_at: string | null
          id: string
          notes: string | null
          organization_id: string
          requirement_id: string
          staff_id: string
          status: string
          training_completion_id: string | null
          updated_at: string
        }
        Insert: {
          auto_checked_at?: string | null
          client_id?: string | null
          completed_by?: string | null
          completed_date?: string | null
          created_at?: string
          evidence_document_id?: string | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          requirement_id: string
          staff_id: string
          status?: string
          training_completion_id?: string | null
          updated_at?: string
        }
        Update: {
          auto_checked_at?: string | null
          client_id?: string | null
          completed_by?: string | null
          completed_date?: string | null
          created_at?: string
          evidence_document_id?: string | null
          expires_at?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          requirement_id?: string
          staff_id?: string
          status?: string
          training_completion_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scc_evidence_fk"
            columns: ["evidence_document_id"]
            isOneToOne: false
            referencedRelation: "hr_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_checklist_completion_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_checklist_completion_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "org_member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_checklist_completion_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_checklist_completion_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_checklist_completion_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "nectar_requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_checklist_completion_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "org_member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_checklist_completion_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_checklist_completion_training_completion_id_fkey"
            columns: ["training_completion_id"]
            isOneToOne: false
            referencedRelation: "training_completions"
            referencedColumns: ["id"]
          },
        ]
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
      staff_other_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          assignment_type: Database["public"]["Enums"]["other_assignment_type"]
          completed_at: string | null
          completion_provenance: Json | null
          completion_source: string | null
          confirmed: boolean
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          is_safety_critical: boolean
          notes: string | null
          organization_id: string
          proposal_rationale: string | null
          proposed_by: Database["public"]["Enums"]["other_assignment_proposer"]
          proposed_by_user: string | null
          requires_admin_confirmation: boolean
          staff_id: string
          status: Database["public"]["Enums"]["other_assignment_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          assignment_type?: Database["public"]["Enums"]["other_assignment_type"]
          completed_at?: string | null
          completion_provenance?: Json | null
          completion_source?: string | null
          confirmed?: boolean
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_safety_critical?: boolean
          notes?: string | null
          organization_id: string
          proposal_rationale?: string | null
          proposed_by?: Database["public"]["Enums"]["other_assignment_proposer"]
          proposed_by_user?: string | null
          requires_admin_confirmation?: boolean
          staff_id: string
          status?: Database["public"]["Enums"]["other_assignment_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          assignment_type?: Database["public"]["Enums"]["other_assignment_type"]
          completed_at?: string | null
          completion_provenance?: Json | null
          completion_source?: string | null
          confirmed?: boolean
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_safety_critical?: boolean
          notes?: string | null
          organization_id?: string
          proposal_rationale?: string | null
          proposed_by?: Database["public"]["Enums"]["other_assignment_proposer"]
          proposed_by_user?: string | null
          requires_admin_confirmation?: boolean
          staff_id?: string
          status?: Database["public"]["Enums"]["other_assignment_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_other_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_training_hours_entries: {
        Row: {
          created_at: string
          created_by: string | null
          entry_date: string
          hours: number
          id: string
          note: string | null
          organization_id: string
          requirement_id: string | null
          staff_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entry_date: string
          hours: number
          id?: string
          note?: string | null
          organization_id: string
          requirement_id?: string | null
          staff_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entry_date?: string
          hours?: number
          id?: string
          note?: string | null
          organization_id?: string
          requirement_id?: string | null
          staff_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_training_hours_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "org_member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_training_hours_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_training_hours_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_training_hours_entries_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "nectar_requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_training_hours_entries_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "org_member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_training_hours_entries_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_types: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          description: string | null
          id: string
          key: string
          label: string
          organization_id: string
          proposed_at: string
          proposed_by: string
          source_basis: string | null
          updated_at: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          description?: string | null
          id?: string
          key: string
          label: string
          organization_id: string
          proposed_at?: string
          proposed_by?: string
          source_basis?: string | null
          updated_at?: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          label?: string
          organization_id?: string
          proposed_at?: string
          proposed_by?: string
          source_basis?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      state_derived_requirements: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          jurisdiction: string | null
          metadata: Json
          requirement_key: string
          source_citation: string | null
          source_id: string | null
          state_code: string
          title: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          jurisdiction?: string | null
          metadata?: Json
          requirement_key: string
          source_citation?: string | null
          source_id?: string | null
          state_code: string
          title: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          jurisdiction?: string | null
          metadata?: Json
          requirement_key?: string
          source_citation?: string | null
          source_id?: string | null
          state_code?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "state_derived_requirements_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "state_requirement_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "state_derived_requirements_state_code_fkey"
            columns: ["state_code"]
            isOneToOne: false
            referencedRelation: "platform_states"
            referencedColumns: ["code"]
          },
        ]
      }
      state_onboarding_sessions: {
        Row: {
          answers: Json
          build_flags: Json
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          id: string
          state_code: string
          status: string
          updated_at: string
        }
        Insert: {
          answers?: Json
          build_flags?: Json
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          state_code: string
          status?: string
          updated_at?: string
        }
        Update: {
          answers?: Json
          build_flags?: Json
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          state_code?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "state_onboarding_sessions_state_code_fkey"
            columns: ["state_code"]
            isOneToOne: false
            referencedRelation: "platform_states"
            referencedColumns: ["code"]
          },
        ]
      }
      state_requirement_sources: {
        Row: {
          created_at: string
          derived_count: number
          id: string
          jurisdiction: string | null
          parse_error: string | null
          parse_status: string
          source_type: string
          state_code: string
          storage_path: string | null
          title: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          derived_count?: number
          id?: string
          jurisdiction?: string | null
          parse_error?: string | null
          parse_status?: string
          source_type?: string
          state_code: string
          storage_path?: string | null
          title: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          derived_count?: number
          id?: string
          jurisdiction?: string | null
          parse_error?: string | null
          parse_status?: string
          source_type?: string
          state_code?: string
          storage_path?: string | null
          title?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "state_requirement_sources_state_code_fkey"
            columns: ["state_code"]
            isOneToOne: false
            referencedRelation: "platform_states"
            referencedColumns: ["code"]
          },
        ]
      }
      state_structural_gaps: {
        Row: {
          area: string
          created_at: string
          created_by: string | null
          detail: string | null
          id: string
          state_code: string
          status: string
          summary: string
          ticket_id: string | null
          updated_at: string
        }
        Insert: {
          area: string
          created_at?: string
          created_by?: string | null
          detail?: string | null
          id?: string
          state_code: string
          status?: string
          summary: string
          ticket_id?: string | null
          updated_at?: string
        }
        Update: {
          area?: string
          created_at?: string
          created_by?: string | null
          detail?: string | null
          id?: string
          state_code?: string
          status?: string
          summary?: string
          ticket_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      state_templates: {
        Row: {
          base_template_upgraded_at: string | null
          base_template_version: number
          billing_codes: Json
          caps: Json
          citations: Json
          created_at: string
          department_structure: Json
          draft: Json
          evv: Json
          forms: Json
          id: string
          published_at: string | null
          published_by: string | null
          regulator: Json
          required_documents: Json
          state_code: string
          terminology: Json
          training: Json
          updated_at: string
          version: number
        }
        Insert: {
          base_template_upgraded_at?: string | null
          base_template_version?: number
          billing_codes?: Json
          caps?: Json
          citations?: Json
          created_at?: string
          department_structure?: Json
          draft?: Json
          evv?: Json
          forms?: Json
          id?: string
          published_at?: string | null
          published_by?: string | null
          regulator?: Json
          required_documents?: Json
          state_code: string
          terminology?: Json
          training?: Json
          updated_at?: string
          version?: number
        }
        Update: {
          base_template_upgraded_at?: string | null
          base_template_version?: number
          billing_codes?: Json
          caps?: Json
          citations?: Json
          created_at?: string
          department_structure?: Json
          draft?: Json
          evv?: Json
          forms?: Json
          id?: string
          published_at?: string | null
          published_by?: string | null
          regulator?: Json
          required_documents?: Json
          state_code?: string
          terminology?: Json
          training?: Json
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "state_templates_state_code_fkey"
            columns: ["state_code"]
            isOneToOne: true
            referencedRelation: "platform_states"
            referencedColumns: ["code"]
          },
        ]
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
          active: boolean
          address: string | null
          capacity: number | null
          color: string | null
          created_at: string
          id: string
          manager_id: string | null
          organization_id: string | null
          setting: string
          team_name: string
          team_type: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          capacity?: number | null
          color?: string | null
          created_at?: string
          id?: string
          manager_id?: string | null
          organization_id?: string | null
          setting?: string
          team_name: string
          team_type?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          capacity?: number | null
          color?: string | null
          created_at?: string
          id?: string
          manager_id?: string | null
          organization_id?: string | null
          setting?: string
          team_name?: string
          team_type?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "org_member_directory"
            referencedColumns: ["id"]
          },
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
      time_off_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          end_date: string
          id: string
          note: string | null
          organization_id: string
          staff_id: string
          start_date: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          end_date: string
          id?: string
          note?: string | null
          organization_id: string
          staff_id: string
          start_date: string
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          end_date?: string
          id?: string
          note?: string | null
          organization_id?: string
          staff_id?: string
          start_date?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_off_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "org_member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_requests_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "org_member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_off_requests_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          cap_behavior: string
          cap_warn_pct: number
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
          cap_behavior?: string
          cap_warn_pct?: number
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
          cap_behavior?: string
          cap_warn_pct?: number
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
      training_checklist_mappings: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          notes: string | null
          requirement_key: string
          training_topic_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          requirement_key: string
          training_topic_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          requirement_key?: string
          training_topic_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_checklist_mappings_training_topic_id_fkey"
            columns: ["training_topic_id"]
            isOneToOne: false
            referencedRelation: "training_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      training_completions: {
        Row: {
          attestation_statement: string
          completed_at: string
          consent_accepted: boolean
          consent_statement: string | null
          content_hash: string | null
          content_version: string | null
          dspd_letter: string | null
          id: string
          ip_address: string | null
          is_current: boolean
          ref_id: string
          signer_email: string | null
          signer_full_name: string | null
          time_zone: string | null
          topic_code: string | null
          topic_kind: Database["public"]["Enums"]["training_topic_kind"]
          topic_title: string
          typed_signature: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          attestation_statement: string
          completed_at?: string
          consent_accepted?: boolean
          consent_statement?: string | null
          content_hash?: string | null
          content_version?: string | null
          dspd_letter?: string | null
          id?: string
          ip_address?: string | null
          is_current?: boolean
          ref_id: string
          signer_email?: string | null
          signer_full_name?: string | null
          time_zone?: string | null
          topic_code?: string | null
          topic_kind: Database["public"]["Enums"]["training_topic_kind"]
          topic_title: string
          typed_signature: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          attestation_statement?: string
          completed_at?: string
          consent_accepted?: boolean
          consent_statement?: string | null
          content_hash?: string | null
          content_version?: string | null
          dspd_letter?: string | null
          id?: string
          ip_address?: string | null
          is_current?: boolean
          ref_id?: string
          signer_email?: string | null
          signer_full_name?: string | null
          time_zone?: string | null
          topic_code?: string | null
          topic_kind?: Database["public"]["Enums"]["training_topic_kind"]
          topic_title?: string
          typed_signature?: string
          user_agent?: string | null
          user_id?: string
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
      training_person_modules: {
        Row: {
          attestation_statement: string
          client_id: string | null
          created_at: string
          description: string | null
          id: string
          mindsmith_url: string | null
          organization_id: string
          title: string
          user_id: string
        }
        Insert: {
          attestation_statement?: string
          client_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          mindsmith_url?: string | null
          organization_id: string
          title: string
          user_id: string
        }
        Update: {
          attestation_statement?: string
          client_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          mindsmith_url?: string | null
          organization_id?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_person_modules_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
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
      training_topic_progress: {
        Row: {
          id: string
          position: number
          ref_id: string
          status: Database["public"]["Enums"]["training_progress_status"]
          topic_kind: Database["public"]["Enums"]["training_topic_kind"]
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          position?: number
          ref_id: string
          status?: Database["public"]["Enums"]["training_progress_status"]
          topic_kind: Database["public"]["Enums"]["training_topic_kind"]
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          position?: number
          ref_id?: string
          status?: Database["public"]["Enums"]["training_progress_status"]
          topic_kind?: Database["public"]["Enums"]["training_topic_kind"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      training_topics: {
        Row: {
          attestation_statement: string
          category: string
          code: string
          created_at: string
          default_hours: number | null
          description: string | null
          dspd_letter: string | null
          id: string
          mindsmith_url: string | null
          sort_order: number
          title: string
        }
        Insert: {
          attestation_statement?: string
          category: string
          code: string
          created_at?: string
          default_hours?: number | null
          description?: string | null
          dspd_letter?: string | null
          id?: string
          mindsmith_url?: string | null
          sort_order?: number
          title: string
        }
        Update: {
          attestation_statement?: string
          category?: string
          code?: string
          created_at?: string
          default_hours?: number | null
          description?: string | null
          dspd_letter?: string | null
          id?: string
          mindsmith_url?: string | null
          sort_order?: number
          title?: string
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
      unfiled_items: {
        Row: {
          filed_at: string | null
          filed_by: string | null
          filed_to: string | null
          id: string
          import_job_id: string
          import_subject_id: string | null
          org_id: string
          source_document_id: string | null
          text: string
        }
        Insert: {
          filed_at?: string | null
          filed_by?: string | null
          filed_to?: string | null
          id?: string
          import_job_id: string
          import_subject_id?: string | null
          org_id: string
          source_document_id?: string | null
          text: string
        }
        Update: {
          filed_at?: string | null
          filed_by?: string | null
          filed_to?: string | null
          id?: string
          import_job_id?: string
          import_subject_id?: string | null
          org_id?: string
          source_document_id?: string | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "unfiled_items_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unfiled_items_import_subject_id_fkey"
            columns: ["import_subject_id"]
            isOneToOne: false
            referencedRelation: "import_subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unfiled_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unfiled_items_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "import_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      user_celebration_mute: {
        Row: {
          muted: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          muted?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          muted?: boolean
          updated_at?: string
          user_id?: string
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
      org_member_directory: {
        Row: {
          account_status: string | null
          email: string | null
          first_name: string | null
          full_name: string | null
          id: string | null
          is_active: boolean | null
          last_name: string | null
          position: string | null
          team_id: string | null
          username: string | null
        }
        Insert: {
          account_status?: string | null
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
          last_name?: string | null
          position?: string | null
          team_id?: string | null
          username?: string | null
        }
        Update: {
          account_status?: string | null
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
          last_name?: string | null
          position?: string | null
          team_id?: string | null
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
        ]
      }
    }
    Functions: {
      accept_invitation: { Args: { _token: string }; Returns: string }
      can_access_import_job: { Args: { _job_id: string }; Returns: boolean }
      can_view_client_intake: {
        Args: { _client: string; _org: string; _viewer: string }
        Returns: boolean
      }
      can_view_staff_pii: {
        Args: { _org: string; _staff: string; _viewer: string }
        Returns: boolean
      }
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
          intake_status: string
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
      get_client_caps: {
        Args: { _client_id: string }
        Returns: {
          client_id: string
          id: string
          monthly_max_units: number
          service_code: string
          unit_type: string
          weekly_cap_units: number
        }[]
      }
      get_hr_client_intake_base: {
        Args: { _org: string }
        Returns: {
          applies_to: string | null
          approval_state: string | null
          category: string | null
          created_at: string
          description: string | null
          id: string
          jurisdiction: string | null
          metadata: Json
          organization_id: string
          origin: string
          requirement_key: string
          review_status: string
          source_citation: string | null
          source_document_id: string | null
          title: string
          updated_at: string
          verified: boolean
          verified_at: string | null
          verified_by: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "nectar_requirements"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_hr_staff_checklist_base: {
        Args: { _org: string }
        Returns: {
          applies_to: string | null
          approval_state: string | null
          category: string | null
          created_at: string
          description: string | null
          id: string
          jurisdiction: string | null
          metadata: Json
          organization_id: string
          origin: string
          requirement_key: string
          review_status: string
          source_citation: string | null
          source_document_id: string | null
          title: string
          updated_at: string
          verified: boolean
          verified_at: string | null
          verified_by: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "nectar_requirements"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_staff_pii: {
        Args: { _org: string; _staff: string }
        Returns: {
          daily_rate: number
          date_of_birth: string
          home_address: string
          hourly_rate: number
          ssn_last4: string
          staff_id: string
        }[]
      }
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
      is_admin_anywhere: { Args: { _user: string }; Returns: boolean }
      is_company_executive: {
        Args: { _org: string; _user: string }
        Returns: boolean
      }
      is_hive_executive: { Args: { _user: string }; Returns: boolean }
      is_hrc_committee_member: {
        Args: { _org: string; _user: string }
        Returns: boolean
      }
      is_org_admin_or_manager: {
        Args: { _org: string; _user: string }
        Returns: boolean
      }
      is_org_member: { Args: { _org: string; _user: string }; Returns: boolean }
      is_super_admin: { Args: { _user: string }; Returns: boolean }
      list_staff_pii: {
        Args: { _org: string }
        Returns: {
          daily_rate: number
          date_of_birth: string
          home_address: string
          hourly_rate: number
          ssn_last4: string
          staff_id: string
        }[]
      }
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
      seed_standard_service_codes: {
        Args: { _org: string }
        Returns: undefined
      }
      set_company_executive: {
        Args: { _grant: boolean; _membership_id: string }
        Returns: undefined
      }
      set_hive_executive: {
        Args: { _grant: boolean; _user_id: string }
        Returns: undefined
      }
      user_org_ids: { Args: { _user: string }; Returns: string[] }
      verify_certificate: {
        Args: { p_code: string }
        Returns: {
          course_title: string
          expires_at: string
          issued_at: string
          recipient_name: string
          verification_code: string
        }[]
      }
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
      app_role:
        | "admin"
        | "manager"
        | "employee"
        | "super_admin"
        | "committee_member"
      assignment_status: "not_started" | "in_progress" | "completed" | "overdue"
      bc_behavior_source: "nectar" | "manual"
      bc_behavior_status: "draft" | "approved" | "published" | "archived"
      bc_code: "BC1" | "BC2" | "BC3"
      bc_doc_type: "FBA" | "BSP"
      bc_flag_type: "credential_mismatch" | "deadline_overdue" | "coverage_gap"
      bc_review_note_type: "monthly_review" | "note"
      external_cert_status: "pending" | "approved" | "rejected" | "expired"
      hive_ticket_category:
        | "structural_gap"
        | "parsing_failure"
        | "expansion_need"
        | "mapping_gap"
        | "permission_inconsistency"
        | "other"
      hive_ticket_severity: "low" | "medium" | "high" | "critical"
      hive_ticket_source: "auto" | "manual"
      hive_ticket_status: "new" | "in_progress" | "resolved"
      home_position: "manager" | "supervisor" | "staff"
      invitation_status: "pending" | "accepted" | "revoked"
      other_assignment_proposer: "admin" | "manager" | "nectar"
      other_assignment_status: "not_started" | "in_progress" | "completed"
      other_assignment_type: "training" | "task" | "requirement"
      provider_training_kind: "policies" | "person"
      provider_training_status: "draft" | "published"
      report_cadence: "weekly" | "monthly"
      sub_plan: "starter" | "pro" | "enterprise" | "custom"
      sub_status: "trial" | "active" | "past_due" | "canceled" | "paused"
      ticket_severity: "low" | "normal" | "high" | "urgent"
      ticket_status:
        | "submitted"
        | "in_progress"
        | "waiting_customer"
        | "resolved"
        | "closed"
      track_type:
        | "onboarding_30"
        | "certification_90"
        | "behavioral"
        | "abi_specialty"
        | "annual"
        | "custom"
      training_progress_status: "not_started" | "in_progress" | "completed"
      training_topic_kind: "core" | "person"
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
      app_role: [
        "admin",
        "manager",
        "employee",
        "super_admin",
        "committee_member",
      ],
      assignment_status: ["not_started", "in_progress", "completed", "overdue"],
      bc_behavior_source: ["nectar", "manual"],
      bc_behavior_status: ["draft", "approved", "published", "archived"],
      bc_code: ["BC1", "BC2", "BC3"],
      bc_doc_type: ["FBA", "BSP"],
      bc_flag_type: ["credential_mismatch", "deadline_overdue", "coverage_gap"],
      bc_review_note_type: ["monthly_review", "note"],
      external_cert_status: ["pending", "approved", "rejected", "expired"],
      hive_ticket_category: [
        "structural_gap",
        "parsing_failure",
        "expansion_need",
        "mapping_gap",
        "permission_inconsistency",
        "other",
      ],
      hive_ticket_severity: ["low", "medium", "high", "critical"],
      hive_ticket_source: ["auto", "manual"],
      hive_ticket_status: ["new", "in_progress", "resolved"],
      home_position: ["manager", "supervisor", "staff"],
      invitation_status: ["pending", "accepted", "revoked"],
      other_assignment_proposer: ["admin", "manager", "nectar"],
      other_assignment_status: ["not_started", "in_progress", "completed"],
      other_assignment_type: ["training", "task", "requirement"],
      provider_training_kind: ["policies", "person"],
      provider_training_status: ["draft", "published"],
      report_cadence: ["weekly", "monthly"],
      sub_plan: ["starter", "pro", "enterprise", "custom"],
      sub_status: ["trial", "active", "past_due", "canceled", "paused"],
      ticket_severity: ["low", "normal", "high", "urgent"],
      ticket_status: [
        "submitted",
        "in_progress",
        "waiting_customer",
        "resolved",
        "closed",
      ],
      track_type: [
        "onboarding_30",
        "certification_90",
        "behavioral",
        "abi_specialty",
        "annual",
        "custom",
      ],
      training_progress_status: ["not_started", "in_progress", "completed"],
      training_topic_kind: ["core", "person"],
    },
  },
} as const
