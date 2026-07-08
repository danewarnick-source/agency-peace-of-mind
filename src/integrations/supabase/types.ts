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
      agreement_requirements: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          renewal_period_months: number | null
          required: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          renewal_period_months?: number | null
          required?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          renewal_period_months?: number | null
          required?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
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
          service_codes: string[] | null
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
          service_codes?: string[] | null
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
          service_codes?: string[] | null
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
      audit_package_access: {
        Row: {
          audit_package_id: string
          auditor_account_id: string
          granted_at: string
          granted_by: string
          id: string
          revoked_at: string | null
        }
        Insert: {
          audit_package_id: string
          auditor_account_id: string
          granted_at?: string
          granted_by: string
          id?: string
          revoked_at?: string | null
        }
        Update: {
          audit_package_id?: string
          auditor_account_id?: string
          granted_at?: string
          granted_by?: string
          id?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_package_access_audit_package_id_fkey"
            columns: ["audit_package_id"]
            isOneToOne: false
            referencedRelation: "audit_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_package_access_auditor_account_id_fkey"
            columns: ["auditor_account_id"]
            isOneToOne: false
            referencedRelation: "auditor_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_package_files: {
        Row: {
          audit_package_id: string
          content_type: string | null
          created_at: string
          file_name: string
          folder_id: string | null
          id: string
          size_bytes: number | null
          storage_bucket: string
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          audit_package_id: string
          content_type?: string | null
          created_at?: string
          file_name: string
          folder_id?: string | null
          id?: string
          size_bytes?: number | null
          storage_bucket?: string
          storage_path: string
          uploaded_by: string
        }
        Update: {
          audit_package_id?: string
          content_type?: string | null
          created_at?: string
          file_name?: string
          folder_id?: string | null
          id?: string
          size_bytes?: number | null
          storage_bucket?: string
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_package_files_audit_package_id_fkey"
            columns: ["audit_package_id"]
            isOneToOne: false
            referencedRelation: "audit_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_package_files_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "audit_package_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_package_folders: {
        Row: {
          audit_package_id: string
          created_at: string
          created_by: string
          id: string
          name: string
        }
        Insert: {
          audit_package_id: string
          created_at?: string
          created_by: string
          id?: string
          name: string
        }
        Update: {
          audit_package_id?: string
          created_at?: string
          created_by?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_package_folders_audit_package_id_fkey"
            columns: ["audit_package_id"]
            isOneToOne: false
            referencedRelation: "audit_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_package_subjects: {
        Row: {
          added_at: string
          audit_package_id: string
          id: string
          subject_id: string
          subject_label: string | null
          subject_type: string
        }
        Insert: {
          added_at?: string
          audit_package_id: string
          id?: string
          subject_id: string
          subject_label?: string | null
          subject_type: string
        }
        Update: {
          added_at?: string
          audit_package_id?: string
          id?: string
          subject_id?: string
          subject_label?: string | null
          subject_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_package_subjects_audit_package_id_fkey"
            columns: ["audit_package_id"]
            isOneToOne: false
            referencedRelation: "audit_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_packages: {
        Row: {
          created_at: string
          created_by: string
          date_range_end: string
          date_range_start: string
          id: string
          notes: string | null
          organization_id: string
          released_at: string | null
          state_agency: string
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          date_range_end: string
          date_range_start: string
          id?: string
          notes?: string | null
          organization_id: string
          released_at?: string | null
          state_agency: string
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          date_range_end?: string
          date_range_start?: string
          id?: string
          notes?: string | null
          organization_id?: string
          released_at?: string | null
          state_agency?: string
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_packages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      auditor_accounts: {
        Row: {
          agency_name: string
          created_at: string
          email: string
          full_name: string
          id: string
          organization_id: string | null
          provisioned_by: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          agency_name: string
          created_at?: string
          email: string
          full_name: string
          id?: string
          organization_id?: string | null
          provisioned_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          agency_name?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          organization_id?: string | null
          provisioned_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auditor_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
      billing_code_approval_messages: {
        Row: {
          action: string | null
          body: string
          created_at: string
          id: string
          read_by_hive_at: string | null
          read_by_provider_at: string | null
          request_id: string
          resolved_signature_at: string | null
          resolved_signature_attested: boolean | null
          resolved_signature_name: string | null
          sender_role: string
          sender_user_id: string
        }
        Insert: {
          action?: string | null
          body: string
          created_at?: string
          id?: string
          read_by_hive_at?: string | null
          read_by_provider_at?: string | null
          request_id: string
          resolved_signature_at?: string | null
          resolved_signature_attested?: boolean | null
          resolved_signature_name?: string | null
          sender_role: string
          sender_user_id: string
        }
        Update: {
          action?: string | null
          body?: string
          created_at?: string
          id?: string
          read_by_hive_at?: string | null
          read_by_provider_at?: string | null
          request_id?: string
          resolved_signature_at?: string | null
          resolved_signature_attested?: boolean | null
          resolved_signature_name?: string | null
          sender_role?: string
          sender_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_code_approval_messages_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "billing_code_approval_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_code_approval_requests: {
        Row: {
          code: string
          created_at: string
          extracted_field_id: string | null
          id: string
          import_job_id: string | null
          justification: string
          organization_id: string
          provider_name_on_pcsp: string | null
          requesting_user_id: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by_user_id: string | null
          resolved_signature_at: string | null
          resolved_signature_attested: boolean | null
          resolved_signature_name: string | null
          status: string
          subject_id: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          extracted_field_id?: string | null
          id?: string
          import_job_id?: string | null
          justification: string
          organization_id: string
          provider_name_on_pcsp?: string | null
          requesting_user_id: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          resolved_signature_at?: string | null
          resolved_signature_attested?: boolean | null
          resolved_signature_name?: string | null
          status?: string
          subject_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          extracted_field_id?: string | null
          id?: string
          import_job_id?: string | null
          justification?: string
          organization_id?: string
          provider_name_on_pcsp?: string | null
          requesting_user_id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by_user_id?: string | null
          resolved_signature_at?: string | null
          resolved_signature_attested?: boolean | null
          resolved_signature_name?: string | null
          status?: string
          subject_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_code_approval_requests_organization_id_fkey"
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
          certification_type_code: string | null
          course_id: string
          course_title: string | null
          created_at: string
          expires_at: string | null
          id: string
          issued_at: string
          organization_id: string
          origin: string | null
          recipient_name: string | null
          requirement_id: string | null
          user_id: string
          verification_code: string
        }
        Insert: {
          certification_type_code?: string | null
          course_id: string
          course_title?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          issued_at?: string
          organization_id: string
          origin?: string | null
          recipient_name?: string | null
          requirement_id?: string | null
          user_id: string
          verification_code?: string
        }
        Update: {
          certification_type_code?: string | null
          course_id?: string
          course_title?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          issued_at?: string
          organization_id?: string
          origin?: string | null
          recipient_name?: string | null
          requirement_id?: string | null
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
          {
            foreignKeyName: "certifications_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "nectar_requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      chore_client_rotation: {
        Row: {
          client_id: string
          created_at: string
          day_of_week: number
          definition_id: string | null
          id: string
          is_free_day: boolean
          note: string | null
          space_id: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          day_of_week: number
          definition_id?: string | null
          id?: string
          is_free_day?: boolean
          note?: string | null
          space_id: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          day_of_week?: number
          definition_id?: string | null
          id?: string
          is_free_day?: boolean
          note?: string | null
          space_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chore_client_rotation_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_client_rotation_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "chore_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_client_rotation_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "chore_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      chore_completions: {
        Row: {
          client_id: string | null
          completed_at: string
          completed_by: string | null
          completion_date: string
          id: string
          note: string | null
          outcome: string
          source: string
          source_id: string
          space_id: string
        }
        Insert: {
          client_id?: string | null
          completed_at?: string
          completed_by?: string | null
          completion_date: string
          id?: string
          note?: string | null
          outcome?: string
          source: string
          source_id: string
          space_id: string
        }
        Update: {
          client_id?: string | null
          completed_at?: string
          completed_by?: string | null
          completion_date?: string
          id?: string
          note?: string | null
          outcome?: string
          source?: string
          source_id?: string
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chore_completions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_completions_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "chore_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      chore_daily_items: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          label: string
          sort_order: number
          space_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: string
          label: string
          sort_order?: number
          space_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: string
          label?: string
          sort_order?: number
          space_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chore_daily_items_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "chore_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      chore_definitions: {
        Row: {
          chore_name: string
          created_at: string
          id: string
          organization_id: string
          sort_order: number
          space_id: string | null
          task_list: string
          updated_at: string
        }
        Insert: {
          chore_name: string
          created_at?: string
          id?: string
          organization_id: string
          sort_order?: number
          space_id?: string | null
          task_list?: string
          updated_at?: string
        }
        Update: {
          chore_name?: string
          created_at?: string
          id?: string
          organization_id?: string
          sort_order?: number
          space_id?: string | null
          task_list?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chore_definitions_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "chore_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      chore_space_clients: {
        Row: {
          client_id: string
          created_at: string
          id: string
          space_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          space_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chore_space_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chore_space_clients_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "chore_spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      chore_spaces: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string
          space_type: string
          team_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id: string
          space_type?: string
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          space_type?: string
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chore_spaces_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
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
      client_billing_code_rate_history: {
        Row: {
          billing_code_id: string
          client_id: string
          created_at: string
          effective_end: string | null
          effective_start: string | null
          id: string
          organization_id: string
          rate_per_unit: number
          rate_source: string | null
          rate_source_at: string | null
          rate_source_document_id: string | null
          rate_source_plan_number: string | null
          service_code: string
          superseded_at: string
          superseded_by: string | null
          unit_type: string
        }
        Insert: {
          billing_code_id: string
          client_id: string
          created_at?: string
          effective_end?: string | null
          effective_start?: string | null
          id?: string
          organization_id: string
          rate_per_unit: number
          rate_source?: string | null
          rate_source_at?: string | null
          rate_source_document_id?: string | null
          rate_source_plan_number?: string | null
          service_code: string
          superseded_at?: string
          superseded_by?: string | null
          unit_type: string
        }
        Update: {
          billing_code_id?: string
          client_id?: string
          created_at?: string
          effective_end?: string | null
          effective_start?: string | null
          id?: string
          organization_id?: string
          rate_per_unit?: number
          rate_source?: string | null
          rate_source_at?: string | null
          rate_source_document_id?: string | null
          rate_source_plan_number?: string | null
          service_code?: string
          superseded_at?: string
          superseded_by?: string | null
          unit_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_billing_code_rate_history_billing_code_id_fkey"
            columns: ["billing_code_id"]
            isOneToOne: false
            referencedRelation: "client_billing_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      client_billing_codes: {
        Row: {
          annual_unit_authorization: number
          authorization_pending: boolean
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
          authorization_pending?: boolean
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
          authorization_pending?: boolean
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
      client_budget_lines: {
        Row: {
          budget_id: string
          created_at: string
          day_of_month: number | null
          id: string
          label: string
          non_variable: number
          notes: string | null
          section: string
          sort_order: number
          updated_at: string
          variable: number
        }
        Insert: {
          budget_id: string
          created_at?: string
          day_of_month?: number | null
          id?: string
          label?: string
          non_variable?: number
          notes?: string | null
          section: string
          sort_order?: number
          updated_at?: string
          variable?: number
        }
        Update: {
          budget_id?: string
          created_at?: string
          day_of_month?: number | null
          id?: string
          label?: string
          non_variable?: number
          notes?: string | null
          section?: string
          sort_order?: number
          updated_at?: string
          variable?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_budget_lines_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "client_budgets"
            referencedColumns: ["id"]
          },
        ]
      }
      client_budgets: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          details: string | null
          id: string
          organization_id: string
          period_month: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          details?: string | null
          id?: string
          organization_id: string
          period_month: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          details?: string | null
          id?: string
          organization_id?: string
          period_month?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_budgets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_budgets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_chore_support: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          client_id: string
          created_at: string
          goal_note: string | null
          id: string
          organization_id: string
          reason: string | null
          status: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          client_id: string
          created_at?: string
          goal_note?: string | null
          id?: string
          organization_id: string
          reason?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          client_id?: string
          created_at?: string
          goal_note?: string | null
          id?: string
          organization_id?: string
          reason?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_chore_support_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_chore_support_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_discharges: {
        Row: {
          additional_notes: string | null
          attested_items: Json
          client_id: string
          discharge_date: string
          discharge_reason: string
          id: string
          initiated_by: string
          organization_id: string
          prior_team_id: string | null
          recorded_at: string
          recorded_by: string
          source_citation: string
          source_document_id: string | null
          source_excerpt: string
        }
        Insert: {
          additional_notes?: string | null
          attested_items?: Json
          client_id: string
          discharge_date: string
          discharge_reason: string
          id?: string
          initiated_by: string
          organization_id: string
          prior_team_id?: string | null
          recorded_at?: string
          recorded_by: string
          source_citation: string
          source_document_id?: string | null
          source_excerpt: string
        }
        Update: {
          additional_notes?: string | null
          attested_items?: Json
          client_id?: string
          discharge_date?: string
          discharge_reason?: string
          id?: string
          initiated_by?: string
          organization_id?: string
          prior_team_id?: string | null
          recorded_at?: string
          recorded_by?: string
          source_citation?: string
          source_document_id?: string | null
          source_excerpt?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_discharges_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_discharges_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_discharges_prior_team_id_fkey"
            columns: ["prior_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_discharges_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "nectar_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      client_documents: {
        Row: {
          client_id: string
          date_source: Database["public"]["Enums"]["doc_date_source"] | null
          document_type: string
          effective_from: string | null
          effective_to: string | null
          effective_to_mode:
            | Database["public"]["Enums"]["doc_effective_to_mode"]
            | null
          file_name: string
          file_size_bytes: number | null
          file_url: string
          id: string
          organization_id: string
          status: Database["public"]["Enums"]["doc_status"]
          storage_path: string | null
          superseded_at: string | null
          superseded_by: string | null
          uploaded_at: string
          uploaded_by: string | null
          uploaded_by_name: string | null
        }
        Insert: {
          client_id: string
          date_source?: Database["public"]["Enums"]["doc_date_source"] | null
          document_type: string
          effective_from?: string | null
          effective_to?: string | null
          effective_to_mode?:
            | Database["public"]["Enums"]["doc_effective_to_mode"]
            | null
          file_name: string
          file_size_bytes?: number | null
          file_url: string
          id?: string
          organization_id: string
          status?: Database["public"]["Enums"]["doc_status"]
          storage_path?: string | null
          superseded_at?: string | null
          superseded_by?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
          uploaded_by_name?: string | null
        }
        Update: {
          client_id?: string
          date_source?: Database["public"]["Enums"]["doc_date_source"] | null
          document_type?: string
          effective_from?: string | null
          effective_to?: string | null
          effective_to_mode?:
            | Database["public"]["Enums"]["doc_effective_to_mode"]
            | null
          file_name?: string
          file_size_bytes?: number | null
          file_url?: string
          id?: string
          organization_id?: string
          status?: Database["public"]["Enums"]["doc_status"]
          storage_path?: string | null
          superseded_at?: string | null
          superseded_by?: string | null
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
          {
            foreignKeyName: "client_documents_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "client_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      client_emergency_contacts: {
        Row: {
          client_id: string
          created_at: string
          id: string
          name: string
          organization_id: string
          phone: string | null
          relationship: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          name: string
          organization_id: string
          phone?: string | null
          relationship?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          phone?: string | null
          relationship?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_emergency_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_external_services: {
        Row: {
          client_id: string
          created_at: string
          id: string
          import_subject_id: string | null
          note: string | null
          organization_id: string
          provider_name: string | null
          service_code: string | null
          source: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          import_subject_id?: string | null
          note?: string | null
          organization_id: string
          provider_name?: string | null
          service_code?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          import_subject_id?: string | null
          note?: string | null
          organization_id?: string
          provider_name?: string | null
          service_code?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_external_services_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_external_services_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      client_meal_actuals: {
        Row: {
          actual_date: string
          confirmed_at: string
          confirmed_by: string | null
          created_at: string
          id: string
          meal_plan_id: string
          meal_slot: string
          note: string | null
          outcome: string
          updated_at: string
        }
        Insert: {
          actual_date: string
          confirmed_at?: string
          confirmed_by?: string | null
          created_at?: string
          id?: string
          meal_plan_id: string
          meal_slot: string
          note?: string | null
          outcome: string
          updated_at?: string
        }
        Update: {
          actual_date?: string
          confirmed_at?: string
          confirmed_by?: string | null
          created_at?: string
          id?: string
          meal_plan_id?: string
          meal_slot?: string
          note?: string | null
          outcome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_meal_actuals_meal_plan_id_fkey"
            columns: ["meal_plan_id"]
            isOneToOne: false
            referencedRelation: "client_meal_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      client_meal_plans: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          food_likes: string | null
          foods_to_avoid: string | null
          id: string
          notes: string | null
          organization_id: string
          updated_at: string
          week_start_date: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          food_likes?: string | null
          foods_to_avoid?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          updated_at?: string
          week_start_date: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          food_likes?: string | null
          foods_to_avoid?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          updated_at?: string
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_meal_plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_meal_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_meal_support: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          client_id: string
          created_at: string
          goal_note: string | null
          id: string
          organization_id: string
          reason: string | null
          status: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          client_id: string
          created_at?: string
          goal_note?: string | null
          id?: string
          organization_id: string
          reason?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          client_id?: string
          created_at?: string
          goal_note?: string | null
          id?: string
          organization_id?: string
          reason?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_meal_support_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_meal_support_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_meals: {
        Row: {
          calories: number | null
          carbs_g: number | null
          created_at: string
          day_of_week: number
          description: string | null
          estimated_cost: number | null
          extra_value: number | null
          fat_g: number | null
          id: string
          label: string
          meal_plan_id: string
          meal_slot: string
          notes: string | null
          nutrition_estimated: Json
          nutrition_value: number | null
          protein_g: number | null
          recipe_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          calories?: number | null
          carbs_g?: number | null
          created_at?: string
          day_of_week: number
          description?: string | null
          estimated_cost?: number | null
          extra_value?: number | null
          fat_g?: number | null
          id?: string
          label?: string
          meal_plan_id: string
          meal_slot: string
          notes?: string | null
          nutrition_estimated?: Json
          nutrition_value?: number | null
          protein_g?: number | null
          recipe_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          calories?: number | null
          carbs_g?: number | null
          created_at?: string
          day_of_week?: number
          description?: string | null
          estimated_cost?: number | null
          extra_value?: number | null
          fat_g?: number | null
          id?: string
          label?: string
          meal_plan_id?: string
          meal_slot?: string
          notes?: string | null
          nutrition_estimated?: Json
          nutrition_value?: number | null
          protein_g?: number | null
          recipe_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_meals_meal_plan_id_fkey"
            columns: ["meal_plan_id"]
            isOneToOne: false
            referencedRelation: "client_meal_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_meals_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "client_recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      client_medications: {
        Row: {
          adverse_effects: string | null
          am_pm: string | null
          choking_risk: boolean
          choking_risk_details: string | null
          client_id: string
          contributes_to_swallowing_difficulty: boolean
          controlled_schedule: string | null
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
          is_rescue: boolean
          medication_name: string
          organization_id: string
          packaging: string | null
          pharmacy: string | null
          pill_count_current: number | null
          pill_count_updated_at: string | null
          prescriber: string | null
          prn_instructions: string | null
          purpose: string | null
          refill_date: string | null
          refill_requested_at: string | null
          refill_requested_by: string | null
          refill_status: string
          refill_threshold: number
          route: string | null
          rx_number: string | null
          scheduled_time: string | null
          scheduled_times: string[]
          side_effects: string | null
          start_date: string | null
          support_explanation: string | null
          support_level: string | null
        }
        Insert: {
          adverse_effects?: string | null
          am_pm?: string | null
          choking_risk?: boolean
          choking_risk_details?: string | null
          client_id: string
          contributes_to_swallowing_difficulty?: boolean
          controlled_schedule?: string | null
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
          is_rescue?: boolean
          medication_name: string
          organization_id: string
          packaging?: string | null
          pharmacy?: string | null
          pill_count_current?: number | null
          pill_count_updated_at?: string | null
          prescriber?: string | null
          prn_instructions?: string | null
          purpose?: string | null
          refill_date?: string | null
          refill_requested_at?: string | null
          refill_requested_by?: string | null
          refill_status?: string
          refill_threshold?: number
          route?: string | null
          rx_number?: string | null
          scheduled_time?: string | null
          scheduled_times?: string[]
          side_effects?: string | null
          start_date?: string | null
          support_explanation?: string | null
          support_level?: string | null
        }
        Update: {
          adverse_effects?: string | null
          am_pm?: string | null
          choking_risk?: boolean
          choking_risk_details?: string | null
          client_id?: string
          contributes_to_swallowing_difficulty?: boolean
          controlled_schedule?: string | null
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
          is_rescue?: boolean
          medication_name?: string
          organization_id?: string
          packaging?: string | null
          pharmacy?: string | null
          pill_count_current?: number | null
          pill_count_updated_at?: string | null
          prescriber?: string | null
          prn_instructions?: string | null
          purpose?: string | null
          refill_date?: string | null
          refill_requested_at?: string | null
          refill_requested_by?: string | null
          refill_status?: string
          refill_threshold?: number
          route?: string | null
          rx_number?: string | null
          scheduled_time?: string | null
          scheduled_times?: string[]
          side_effects?: string | null
          start_date?: string | null
          support_explanation?: string | null
          support_level?: string | null
        }
        Relationships: []
      }
      client_nutrition_config: {
        Row: {
          calorie_target: number | null
          carbs_target_g: number | null
          client_id: string
          created_at: string
          extra_label: string | null
          extra_target: number | null
          extra_unit: string | null
          fat_target_g: number | null
          id: string
          nutrition_label: string
          nutrition_unit: string
          organization_id: string
          protein_target_g: number | null
          updated_at: string
          use_extra_field: boolean
        }
        Insert: {
          calorie_target?: number | null
          carbs_target_g?: number | null
          client_id: string
          created_at?: string
          extra_label?: string | null
          extra_target?: number | null
          extra_unit?: string | null
          fat_target_g?: number | null
          id?: string
          nutrition_label?: string
          nutrition_unit?: string
          organization_id: string
          protein_target_g?: number | null
          updated_at?: string
          use_extra_field?: boolean
        }
        Update: {
          calorie_target?: number | null
          carbs_target_g?: number | null
          client_id?: string
          created_at?: string
          extra_label?: string | null
          extra_target?: number | null
          extra_unit?: string | null
          fat_target_g?: number | null
          id?: string
          nutrition_label?: string
          nutrition_unit?: string
          organization_id?: string
          protein_target_g?: number | null
          updated_at?: string
          use_extra_field?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "client_nutrition_config_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_nutrition_config_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_progress_summaries: {
        Row: {
          client_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          draft_content: string | null
          draft_source: Json | null
          drafted_at: string | null
          drafted_by: string | null
          due_date: string
          final_content: string | null
          finalized_at: string | null
          finalized_by: string | null
          finalized_by_name: string | null
          id: string
          include_goal_progress: boolean
          organization_id: string
          period_end: string
          period_kind: string
          period_label: string
          period_start: string
          requires_upi_attestation: boolean
          service_codes: string[]
          status: string
          summary_kind: string
          updated_at: string
          upi_entered_at: string | null
          upi_entered_by: string | null
        }
        Insert: {
          client_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          draft_content?: string | null
          draft_source?: Json | null
          drafted_at?: string | null
          drafted_by?: string | null
          due_date: string
          final_content?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          finalized_by_name?: string | null
          id?: string
          include_goal_progress?: boolean
          organization_id: string
          period_end: string
          period_kind: string
          period_label: string
          period_start: string
          requires_upi_attestation?: boolean
          service_codes?: string[]
          status?: string
          summary_kind?: string
          updated_at?: string
          upi_entered_at?: string | null
          upi_entered_by?: string | null
        }
        Update: {
          client_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          draft_content?: string | null
          draft_source?: Json | null
          drafted_at?: string | null
          drafted_by?: string | null
          due_date?: string
          final_content?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          finalized_by_name?: string | null
          id?: string
          include_goal_progress?: boolean
          organization_id?: string
          period_end?: string
          period_kind?: string
          period_label?: string
          period_start?: string
          requires_upi_attestation?: boolean
          service_codes?: string[]
          status?: string
          summary_kind?: string
          updated_at?: string
          upi_entered_at?: string | null
          upi_entered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_progress_summaries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_progress_summaries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
      client_recipe_ingredients: {
        Row: {
          created_at: string
          estimated_cost: number | null
          id: string
          item: string
          quantity: string | null
          recipe_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          estimated_cost?: number | null
          id?: string
          item: string
          quantity?: string | null
          recipe_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          estimated_cost?: number | null
          id?: string
          item?: string
          quantity?: string | null
          recipe_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "client_recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      client_recipes: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string
          source_text: string | null
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id: string
          source_text?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          source_text?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_recipes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_recipes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_shopping_items: {
        Row: {
          checked: boolean
          created_at: string
          id: string
          item: string
          meal_plan_id: string
          quantity: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          checked?: boolean
          created_at?: string
          id?: string
          item?: string
          meal_plan_id: string
          quantity?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          checked?: boolean
          created_at?: string
          id?: string
          item?: string
          meal_plan_id?: string
          quantity?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_shopping_items_meal_plan_id_fkey"
            columns: ["meal_plan_id"]
            isOneToOne: false
            referencedRelation: "client_meal_plans"
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
          goals: Json
          id: string
          organization_id: string
          review_questions: Json
          status: string
          title: string
          training_type: string
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
          goals?: Json
          id?: string
          organization_id: string
          review_questions?: Json
          status?: string
          title?: string
          training_type?: string
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
          goals?: Json
          id?: string
          organization_id?: string
          review_questions?: Json
          status?: string
          title?: string
          training_type?: string
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
          admin_hours_per_week: number | null
          admission_date: string | null
          advanced_directives: boolean | null
          allergies: string[]
          authorized_dspd_codes: string[]
          bsp_status: string | null
          chronic_conditions: string[] | null
          client_photo_taken_on: string | null
          client_photo_url: string | null
          client_pid: string | null
          clinical_alert: string | null
          court_orders: string[] | null
          created_at: string
          date_of_birth: string | null
          day_program_provider: string | null
          dentist_address: string | null
          dentist_name: string | null
          dentist_phone: string | null
          diagnoses: string[] | null
          dietary_needs: string | null
          disability_category: string | null
          discharge_date: string | null
          dnr_applicable: boolean
          dnr_location: string | null
          dnr_status: string | null
          dysphagia: boolean
          emergency_contact_2_address: string | null
          emergency_contact_2_instructions: string | null
          emergency_contact_2_name: string | null
          emergency_contact_2_phone: string | null
          emergency_contact_2_relationship: string | null
          emergency_contact_address: string | null
          emergency_contact_instructions: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          emergency_medical_treatment_authorization: boolean | null
          ethnic_origin: string | null
          eye_color: string | null
          feature_config: Json | null
          field_confirmations: Json
          first_name: string
          form_1056_approved_date: string | null
          form_1056_number: string | null
          geofence_radius_feet: number
          grievance_acknowledged: boolean | null
          grievance_signed_date: string | null
          guardian_address: string | null
          guardian_email: string | null
          guardian_name: string | null
          guardian_phone: string | null
          guardian_relationship: string | null
          hair_color: string | null
          has_abi: boolean
          height_inches: number | null
          hhs_monthly_support_hours: number | null
          home_latitude: number | null
          home_longitude: number | null
          hospice_status: string | null
          housing_voucher: string | null
          hr_applicable: boolean
          id: string
          identifying_marks: string | null
          immunizations: string[] | null
          income_sources: string[] | null
          intake_date: string | null
          intake_status: string
          is_own_guardian: boolean
          job_code: string[]
          last_name: string
          level_of_need: string | null
          mailing_address: string | null
          meal_actuals_assignee: string | null
          med_prescriber_name: string | null
          med_prescriber_phone: string | null
          medicaid_case_number: string | null
          medicaid_id: string | null
          medical_insurance: string | null
          medicare_number: string | null
          needs_shopping_help: boolean
          neurologist_name: string | null
          neurologist_phone: string | null
          organization_id: string
          palliative_care_status: string | null
          payment_sources: string[] | null
          pcp_name: string | null
          pcp_phone: string | null
          pcsp_expiration_date: string | null
          pcsp_goals: string[]
          pcsp_signed_date: string | null
          personal_belongings_inventory: string[] | null
          pertinent_health_notes: string | null
          phone_number: string | null
          physical_address: string | null
          physician_address: string | null
          place_of_birth: string | null
          places_frequented: string | null
          plan_year: string | null
          polst_status: string | null
          preferred_activities: string[] | null
          preferred_living: string | null
          prescriber_name: string | null
          prescriber_phone: string | null
          primary_care_name: string | null
          primary_care_phone: string | null
          private_insurance: string | null
          profile_photo_url: string | null
          psychiatrist_address: string | null
          psychiatrist_name: string | null
          psychiatrist_phone: string | null
          religion: string | null
          residential_provider: string | null
          rights_restrictions: string[] | null
          roommates: string[] | null
          self_admin_med_support: boolean
          special_directions: string | null
          specialist_name: string | null
          specialist_phone: string | null
          ssn_last4: string | null
          staff_ratio: string | null
          state_id_expires_on: string | null
          state_id_number: string | null
          support_coordinator_company: string | null
          support_coordinator_email: string | null
          support_coordinator_name: string | null
          support_coordinator_phone: string | null
          swallowing_alerts: string[]
          team_id: string | null
          weight_pounds: number | null
        }
        Insert: {
          account_status?: string
          admin_hours_per_week?: number | null
          admission_date?: string | null
          advanced_directives?: boolean | null
          allergies?: string[]
          authorized_dspd_codes?: string[]
          bsp_status?: string | null
          chronic_conditions?: string[] | null
          client_photo_taken_on?: string | null
          client_photo_url?: string | null
          client_pid?: string | null
          clinical_alert?: string | null
          court_orders?: string[] | null
          created_at?: string
          date_of_birth?: string | null
          day_program_provider?: string | null
          dentist_address?: string | null
          dentist_name?: string | null
          dentist_phone?: string | null
          diagnoses?: string[] | null
          dietary_needs?: string | null
          disability_category?: string | null
          discharge_date?: string | null
          dnr_applicable?: boolean
          dnr_location?: string | null
          dnr_status?: string | null
          dysphagia?: boolean
          emergency_contact_2_address?: string | null
          emergency_contact_2_instructions?: string | null
          emergency_contact_2_name?: string | null
          emergency_contact_2_phone?: string | null
          emergency_contact_2_relationship?: string | null
          emergency_contact_address?: string | null
          emergency_contact_instructions?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          emergency_medical_treatment_authorization?: boolean | null
          ethnic_origin?: string | null
          eye_color?: string | null
          feature_config?: Json | null
          field_confirmations?: Json
          first_name: string
          form_1056_approved_date?: string | null
          form_1056_number?: string | null
          geofence_radius_feet?: number
          grievance_acknowledged?: boolean | null
          grievance_signed_date?: string | null
          guardian_address?: string | null
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          guardian_relationship?: string | null
          hair_color?: string | null
          has_abi?: boolean
          height_inches?: number | null
          hhs_monthly_support_hours?: number | null
          home_latitude?: number | null
          home_longitude?: number | null
          hospice_status?: string | null
          housing_voucher?: string | null
          hr_applicable?: boolean
          id?: string
          identifying_marks?: string | null
          immunizations?: string[] | null
          income_sources?: string[] | null
          intake_date?: string | null
          intake_status?: string
          is_own_guardian?: boolean
          job_code?: string[]
          last_name: string
          level_of_need?: string | null
          mailing_address?: string | null
          meal_actuals_assignee?: string | null
          med_prescriber_name?: string | null
          med_prescriber_phone?: string | null
          medicaid_case_number?: string | null
          medicaid_id?: string | null
          medical_insurance?: string | null
          medicare_number?: string | null
          needs_shopping_help?: boolean
          neurologist_name?: string | null
          neurologist_phone?: string | null
          organization_id: string
          palliative_care_status?: string | null
          payment_sources?: string[] | null
          pcp_name?: string | null
          pcp_phone?: string | null
          pcsp_expiration_date?: string | null
          pcsp_goals?: string[]
          pcsp_signed_date?: string | null
          personal_belongings_inventory?: string[] | null
          pertinent_health_notes?: string | null
          phone_number?: string | null
          physical_address?: string | null
          physician_address?: string | null
          place_of_birth?: string | null
          places_frequented?: string | null
          plan_year?: string | null
          polst_status?: string | null
          preferred_activities?: string[] | null
          preferred_living?: string | null
          prescriber_name?: string | null
          prescriber_phone?: string | null
          primary_care_name?: string | null
          primary_care_phone?: string | null
          private_insurance?: string | null
          profile_photo_url?: string | null
          psychiatrist_address?: string | null
          psychiatrist_name?: string | null
          psychiatrist_phone?: string | null
          religion?: string | null
          residential_provider?: string | null
          rights_restrictions?: string[] | null
          roommates?: string[] | null
          self_admin_med_support?: boolean
          special_directions?: string | null
          specialist_name?: string | null
          specialist_phone?: string | null
          ssn_last4?: string | null
          staff_ratio?: string | null
          state_id_expires_on?: string | null
          state_id_number?: string | null
          support_coordinator_company?: string | null
          support_coordinator_email?: string | null
          support_coordinator_name?: string | null
          support_coordinator_phone?: string | null
          swallowing_alerts?: string[]
          team_id?: string | null
          weight_pounds?: number | null
        }
        Update: {
          account_status?: string
          admin_hours_per_week?: number | null
          admission_date?: string | null
          advanced_directives?: boolean | null
          allergies?: string[]
          authorized_dspd_codes?: string[]
          bsp_status?: string | null
          chronic_conditions?: string[] | null
          client_photo_taken_on?: string | null
          client_photo_url?: string | null
          client_pid?: string | null
          clinical_alert?: string | null
          court_orders?: string[] | null
          created_at?: string
          date_of_birth?: string | null
          day_program_provider?: string | null
          dentist_address?: string | null
          dentist_name?: string | null
          dentist_phone?: string | null
          diagnoses?: string[] | null
          dietary_needs?: string | null
          disability_category?: string | null
          discharge_date?: string | null
          dnr_applicable?: boolean
          dnr_location?: string | null
          dnr_status?: string | null
          dysphagia?: boolean
          emergency_contact_2_address?: string | null
          emergency_contact_2_instructions?: string | null
          emergency_contact_2_name?: string | null
          emergency_contact_2_phone?: string | null
          emergency_contact_2_relationship?: string | null
          emergency_contact_address?: string | null
          emergency_contact_instructions?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          emergency_medical_treatment_authorization?: boolean | null
          ethnic_origin?: string | null
          eye_color?: string | null
          feature_config?: Json | null
          field_confirmations?: Json
          first_name?: string
          form_1056_approved_date?: string | null
          form_1056_number?: string | null
          geofence_radius_feet?: number
          grievance_acknowledged?: boolean | null
          grievance_signed_date?: string | null
          guardian_address?: string | null
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          guardian_relationship?: string | null
          hair_color?: string | null
          has_abi?: boolean
          height_inches?: number | null
          hhs_monthly_support_hours?: number | null
          home_latitude?: number | null
          home_longitude?: number | null
          hospice_status?: string | null
          housing_voucher?: string | null
          hr_applicable?: boolean
          id?: string
          identifying_marks?: string | null
          immunizations?: string[] | null
          income_sources?: string[] | null
          intake_date?: string | null
          intake_status?: string
          is_own_guardian?: boolean
          job_code?: string[]
          last_name?: string
          level_of_need?: string | null
          mailing_address?: string | null
          meal_actuals_assignee?: string | null
          med_prescriber_name?: string | null
          med_prescriber_phone?: string | null
          medicaid_case_number?: string | null
          medicaid_id?: string | null
          medical_insurance?: string | null
          medicare_number?: string | null
          needs_shopping_help?: boolean
          neurologist_name?: string | null
          neurologist_phone?: string | null
          organization_id?: string
          palliative_care_status?: string | null
          payment_sources?: string[] | null
          pcp_name?: string | null
          pcp_phone?: string | null
          pcsp_expiration_date?: string | null
          pcsp_goals?: string[]
          pcsp_signed_date?: string | null
          personal_belongings_inventory?: string[] | null
          pertinent_health_notes?: string | null
          phone_number?: string | null
          physical_address?: string | null
          physician_address?: string | null
          place_of_birth?: string | null
          places_frequented?: string | null
          plan_year?: string | null
          polst_status?: string | null
          preferred_activities?: string[] | null
          preferred_living?: string | null
          prescriber_name?: string | null
          prescriber_phone?: string | null
          primary_care_name?: string | null
          primary_care_phone?: string | null
          private_insurance?: string | null
          profile_photo_url?: string | null
          psychiatrist_address?: string | null
          psychiatrist_name?: string | null
          psychiatrist_phone?: string | null
          religion?: string | null
          residential_provider?: string | null
          rights_restrictions?: string[] | null
          roommates?: string[] | null
          self_admin_med_support?: boolean
          special_directions?: string | null
          specialist_name?: string | null
          specialist_phone?: string | null
          ssn_last4?: string | null
          staff_ratio?: string | null
          state_id_expires_on?: string | null
          state_id_number?: string | null
          support_coordinator_company?: string | null
          support_coordinator_email?: string | null
          support_coordinator_name?: string | null
          support_coordinator_phone?: string | null
          swallowing_alerts?: string[]
          team_id?: string | null
          weight_pounds?: number | null
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
      contractor_monthly_pay: {
        Row: {
          additional_pay: number
          created_at: string
          id: string
          month: number
          net_pay: number
          notes: string | null
          organization_id: string
          staff_id: string
          tax_federal: number
          tax_fica: number
          tax_state: number
          updated_at: string
          updated_by: string | null
          year: number
        }
        Insert: {
          additional_pay?: number
          created_at?: string
          id?: string
          month: number
          net_pay?: number
          notes?: string | null
          organization_id: string
          staff_id: string
          tax_federal?: number
          tax_fica?: number
          tax_state?: number
          updated_at?: string
          updated_by?: string | null
          year: number
        }
        Update: {
          additional_pay?: number
          created_at?: string
          id?: string
          month?: number
          net_pay?: number
          notes?: string | null
          organization_id?: string
          staff_id?: string
          tax_federal?: number
          tax_fica?: number
          tax_state?: number
          updated_at?: string
          updated_by?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "contractor_monthly_pay_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      controlled_med_counts: {
        Row: {
          client_id: string
          context: string
          counted_value: number
          created_at: string
          emar_log_id: string | null
          expected_count: number | null
          flagged: boolean
          id: string
          medication_id: string
          notes: string | null
          organization_id: string
          signature_data_url: string | null
          staff_id: string
          staff_name: string | null
          variance: number | null
        }
        Insert: {
          client_id: string
          context: string
          counted_value: number
          created_at?: string
          emar_log_id?: string | null
          expected_count?: number | null
          flagged?: boolean
          id?: string
          medication_id: string
          notes?: string | null
          organization_id: string
          signature_data_url?: string | null
          staff_id: string
          staff_name?: string | null
          variance?: number | null
        }
        Update: {
          client_id?: string
          context?: string
          counted_value?: number
          created_at?: string
          emar_log_id?: string | null
          expected_count?: number | null
          flagged?: boolean
          id?: string
          medication_id?: string
          notes?: string | null
          organization_id?: string
          signature_data_url?: string | null
          staff_id?: string
          staff_name?: string | null
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "controlled_med_counts_emar_log_id_fkey"
            columns: ["emar_log_id"]
            isOneToOne: false
            referencedRelation: "emar_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "controlled_med_counts_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "client_medications"
            referencedColumns: ["id"]
          },
        ]
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
          attested_on_behalf: boolean
          attested_on_behalf_by: string | null
          attested_on_behalf_of_staff_id: string | null
          attested_on_behalf_reason: string | null
          backdated: boolean
          client_id: string
          created_at: string
          denial_reason: string | null
          denied_at: string | null
          denied_by: string | null
          followup_form_types: string[] | null
          id: string
          import_job_id: string | null
          import_source: string | null
          late_submission_reason: string | null
          log_date: string
          narrative: string
          organization_id: string
          original_due_date: string | null
          pcsp_goals_addressed: string[]
          requires_followup_form: boolean
          signature_data_url: string | null
          staff_attested_at: string | null
          staff_attested_by: string | null
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
          attested_on_behalf?: boolean
          attested_on_behalf_by?: string | null
          attested_on_behalf_of_staff_id?: string | null
          attested_on_behalf_reason?: string | null
          backdated?: boolean
          client_id: string
          created_at?: string
          denial_reason?: string | null
          denied_at?: string | null
          denied_by?: string | null
          followup_form_types?: string[] | null
          id?: string
          import_job_id?: string | null
          import_source?: string | null
          late_submission_reason?: string | null
          log_date?: string
          narrative: string
          organization_id: string
          original_due_date?: string | null
          pcsp_goals_addressed?: string[]
          requires_followup_form?: boolean
          signature_data_url?: string | null
          staff_attested_at?: string | null
          staff_attested_by?: string | null
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
          attested_on_behalf?: boolean
          attested_on_behalf_by?: string | null
          attested_on_behalf_of_staff_id?: string | null
          attested_on_behalf_reason?: string | null
          backdated?: boolean
          client_id?: string
          created_at?: string
          denial_reason?: string | null
          denied_at?: string | null
          denied_by?: string | null
          followup_form_types?: string[] | null
          id?: string
          import_job_id?: string | null
          import_source?: string | null
          late_submission_reason?: string | null
          log_date?: string
          narrative?: string
          organization_id?: string
          original_due_date?: string | null
          pcsp_goals_addressed?: string[]
          requires_followup_form?: boolean
          signature_data_url?: string | null
          staff_attested_at?: string | null
          staff_attested_by?: string | null
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
      day_program_attendance: {
        Row: {
          activity_note: string | null
          arrival_time: string | null
          attended: boolean
          billed_code: string | null
          billed_mode: string | null
          billed_rate: number | null
          billed_units: number | null
          cap_snapshot: number | null
          client_id: string
          created_at: string
          departure_time: string | null
          id: string
          override_reason: string | null
          session_id: string
          updated_at: string
        }
        Insert: {
          activity_note?: string | null
          arrival_time?: string | null
          attended?: boolean
          billed_code?: string | null
          billed_mode?: string | null
          billed_rate?: number | null
          billed_units?: number | null
          cap_snapshot?: number | null
          client_id: string
          created_at?: string
          departure_time?: string | null
          id?: string
          override_reason?: string | null
          session_id: string
          updated_at?: string
        }
        Update: {
          activity_note?: string | null
          arrival_time?: string | null
          attended?: boolean
          billed_code?: string | null
          billed_mode?: string | null
          billed_rate?: number | null
          billed_units?: number | null
          cap_snapshot?: number | null
          client_id?: string
          created_at?: string
          departure_time?: string | null
          id?: string
          override_reason?: string | null
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_program_attendance_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_program_attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "day_program_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      day_program_session_staff: {
        Row: {
          clock_in: string | null
          clock_out: string | null
          created_at: string
          id: string
          session_id: string
          staff_id: string
          updated_at: string
        }
        Insert: {
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          id?: string
          session_id: string
          staff_id: string
          updated_at?: string
        }
        Update: {
          clock_in?: string | null
          clock_out?: string | null
          created_at?: string
          id?: string
          session_id?: string
          staff_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_program_session_staff_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "day_program_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      day_program_sessions: {
        Row: {
          created_at: string
          created_by: string | null
          end_time: string
          id: string
          location_id: string | null
          location_label: string | null
          notes: string | null
          organization_id: string
          service_code: string
          session_date: string
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_time: string
          id?: string
          location_id?: string | null
          location_label?: string | null
          notes?: string | null
          organization_id: string
          service_code: string
          session_date: string
          start_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_time?: string
          id?: string
          location_id?: string | null
          location_label?: string | null
          notes?: string | null
          organization_id?: string
          service_code?: string
          session_date?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_program_sessions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "day_program_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      day_program_transport: {
        Row: {
          attendance_id: string
          created_at: string
          dropoff_location: string | null
          dropoff_time: string | null
          id: string
          mtp_billed: boolean
          mtp_block_reason: string | null
          pickup_location: string | null
          pickup_time: string | null
          transport_staff_id: string | null
          updated_at: string
        }
        Insert: {
          attendance_id: string
          created_at?: string
          dropoff_location?: string | null
          dropoff_time?: string | null
          id?: string
          mtp_billed?: boolean
          mtp_block_reason?: string | null
          pickup_location?: string | null
          pickup_time?: string | null
          transport_staff_id?: string | null
          updated_at?: string
        }
        Update: {
          attendance_id?: string
          created_at?: string
          dropoff_location?: string | null
          dropoff_time?: string | null
          id?: string
          mtp_billed?: boolean
          mtp_block_reason?: string | null
          pickup_location?: string | null
          pickup_time?: string | null
          transport_staff_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "day_program_transport_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: true
            referencedRelation: "day_program_attendance"
            referencedColumns: ["id"]
          },
        ]
      }
      distribution_plan_participants: {
        Row: {
          allocation_pct: number
          created_at: string
          id: string
          notes: string | null
          participant_name: string
          participant_user_id: string | null
          plan_id: string
          role_label: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          allocation_pct?: number
          created_at?: string
          id?: string
          notes?: string | null
          participant_name: string
          participant_user_id?: string | null
          plan_id: string
          role_label?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          allocation_pct?: number
          created_at?: string
          id?: string
          notes?: string | null
          participant_name?: string
          participant_user_id?: string | null
          plan_id?: string
          role_label?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "distribution_plan_participants_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "distribution_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      distribution_plans: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          expense_selection: Json
          formula_json: Json | null
          id: string
          is_active: boolean
          name: string
          nectar_summary: string | null
          organization_id: string
          plan_type: string
          retention_pct: number
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          expense_selection?: Json
          formula_json?: Json | null
          id?: string
          is_active?: boolean
          name: string
          nectar_summary?: string | null
          organization_id: string
          plan_type: string
          retention_pct?: number
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          expense_selection?: Json
          formula_json?: Json | null
          id?: string
          is_active?: boolean
          name?: string
          nectar_summary?: string | null
          organization_id?: string
          plan_type?: string
          retention_pct?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "distribution_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_attestations: {
        Row: {
          attestation_text: string
          attested_at: string
          attested_by: string
          attested_by_name: string | null
          created_at: string
          hr_document_id: string | null
          id: string
          organization_id: string
          staff_id: string
          subject_kind: string
          subject_ref: string
        }
        Insert: {
          attestation_text: string
          attested_at?: string
          attested_by: string
          attested_by_name?: string | null
          created_at?: string
          hr_document_id?: string | null
          id?: string
          organization_id: string
          staff_id: string
          subject_kind: string
          subject_ref: string
        }
        Update: {
          attestation_text?: string
          attested_at?: string
          attested_by?: string
          attested_by_name?: string | null
          created_at?: string
          hr_document_id?: string | null
          id?: string
          organization_id?: string
          staff_id?: string
          subject_kind?: string
          subject_ref?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_attestations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      emar_log_addenda: {
        Row: {
          created_at: string
          emar_log_id: string
          id: string
          note: string
          organization_id: string
          signature_data_url: string | null
          staff_id: string
          staff_name: string | null
        }
        Insert: {
          created_at?: string
          emar_log_id: string
          id?: string
          note: string
          organization_id: string
          signature_data_url?: string | null
          staff_id: string
          staff_name?: string | null
        }
        Update: {
          created_at?: string
          emar_log_id?: string
          id?: string
          note?: string
          organization_id?: string
          signature_data_url?: string | null
          staff_id?: string
          staff_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "emar_log_addenda_emar_log_id_fkey"
            columns: ["emar_log_id"]
            isOneToOne: false
            referencedRelation: "emar_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      emar_logs: {
        Row: {
          actual_taken_at: string | null
          admin_review_notes: string | null
          admin_reviewed: boolean
          admin_reviewed_at: string | null
          admin_reviewed_by: string | null
          administered_at: string | null
          attestation_signed: boolean
          client_id: string
          created_at: string
          documented_at: string
          emergency_services_called: boolean | null
          error_description: string | null
          exception_reason: string | null
          id: string
          is_controlled: boolean
          is_medication_error: boolean
          is_prn: boolean
          late_entry_gap_minutes: number | null
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
          second_witness_id: string | null
          seizure_duration_seconds: number | null
          seizure_outcome: string | null
          service_context: string | null
          signature_attestation: string | null
          signature_data_url: string | null
          staff_id: string | null
          staff_name: string | null
          status: string
          variance_note: string | null
        }
        Insert: {
          actual_taken_at?: string | null
          admin_review_notes?: string | null
          admin_reviewed?: boolean
          admin_reviewed_at?: string | null
          admin_reviewed_by?: string | null
          administered_at?: string | null
          attestation_signed?: boolean
          client_id: string
          created_at?: string
          documented_at?: string
          emergency_services_called?: boolean | null
          error_description?: string | null
          exception_reason?: string | null
          id?: string
          is_controlled?: boolean
          is_medication_error?: boolean
          is_prn?: boolean
          late_entry_gap_minutes?: number | null
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
          second_witness_id?: string | null
          seizure_duration_seconds?: number | null
          seizure_outcome?: string | null
          service_context?: string | null
          signature_attestation?: string | null
          signature_data_url?: string | null
          staff_id?: string | null
          staff_name?: string | null
          status: string
          variance_note?: string | null
        }
        Update: {
          actual_taken_at?: string | null
          admin_review_notes?: string | null
          admin_reviewed?: boolean
          admin_reviewed_at?: string | null
          admin_reviewed_by?: string | null
          administered_at?: string | null
          attestation_signed?: boolean
          client_id?: string
          created_at?: string
          documented_at?: string
          emergency_services_called?: boolean | null
          error_description?: string | null
          exception_reason?: string | null
          id?: string
          is_controlled?: boolean
          is_medication_error?: boolean
          is_prn?: boolean
          late_entry_gap_minutes?: number | null
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
          second_witness_id?: string | null
          seizure_duration_seconds?: number | null
          seizure_outcome?: string | null
          service_context?: string | null
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
          {
            foreignKeyName: "emar_logs_second_witness_id_fkey"
            columns: ["second_witness_id"]
            isOneToOne: false
            referencedRelation: "org_member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emar_logs_second_witness_id_fkey"
            columns: ["second_witness_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_documents: {
        Row: {
          created_at: string
          date_source: Database["public"]["Enums"]["doc_date_source"] | null
          effective_from: string | null
          effective_to: string | null
          effective_to_mode:
            | Database["public"]["Enums"]["doc_effective_to_mode"]
            | null
          file_name: string | null
          file_path: string
          id: string
          kind: string
          mime_type: string | null
          nectar_applied_fields: Json
          nectar_error: string | null
          nectar_last_run_at: string | null
          nectar_status: string
          organization_id: string
          size_bytes: number | null
          staff_id: string
          status: Database["public"]["Enums"]["doc_status"]
          superseded_at: string | null
          superseded_by: string | null
          title: string | null
          updated_at: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          date_source?: Database["public"]["Enums"]["doc_date_source"] | null
          effective_from?: string | null
          effective_to?: string | null
          effective_to_mode?:
            | Database["public"]["Enums"]["doc_effective_to_mode"]
            | null
          file_name?: string | null
          file_path: string
          id?: string
          kind?: string
          mime_type?: string | null
          nectar_applied_fields?: Json
          nectar_error?: string | null
          nectar_last_run_at?: string | null
          nectar_status?: string
          organization_id: string
          size_bytes?: number | null
          staff_id: string
          status?: Database["public"]["Enums"]["doc_status"]
          superseded_at?: string | null
          superseded_by?: string | null
          title?: string | null
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          date_source?: Database["public"]["Enums"]["doc_date_source"] | null
          effective_from?: string | null
          effective_to?: string | null
          effective_to_mode?:
            | Database["public"]["Enums"]["doc_effective_to_mode"]
            | null
          file_name?: string | null
          file_path?: string
          id?: string
          kind?: string
          mime_type?: string | null
          nectar_applied_fields?: Json
          nectar_error?: string | null
          nectar_last_run_at?: string | null
          nectar_status?: string
          organization_id?: string
          size_bytes?: number | null
          staff_id?: string
          status?: Database["public"]["Enums"]["doc_status"]
          superseded_at?: string | null
          superseded_by?: string | null
          title?: string | null
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "employee_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_loan_entries: {
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
          entry_date: string
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
            foreignKeyName: "employee_loan_entries_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "employee_loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_loan_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_loan_signature_tokens: {
        Row: {
          agreement_snapshot: Json
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          loan_id: string
          organization_id: string
          signer_email: string
          signer_name: string
          token_hash: string
          used_at: string | null
        }
        Insert: {
          agreement_snapshot: Json
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          loan_id: string
          organization_id: string
          signer_email: string
          signer_name: string
          token_hash: string
          used_at?: string | null
        }
        Update: {
          agreement_snapshot?: Json
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          loan_id?: string
          organization_id?: string
          signer_email?: string
          signer_name?: string
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_loan_signature_tokens_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "employee_loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_loan_signature_tokens_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_loan_signatures: {
        Row: {
          agreement_sha256: string
          agreement_snapshot: Json
          id: string
          loan_id: string
          organization_id: string
          signature_image: string
          signature_method: string
          signed_at: string
          signer_email: string | null
          signer_ip: string | null
          signer_name: string
          signer_type: string
          signer_user_agent: string | null
          token_id: string | null
        }
        Insert: {
          agreement_sha256: string
          agreement_snapshot: Json
          id?: string
          loan_id: string
          organization_id: string
          signature_image: string
          signature_method: string
          signed_at?: string
          signer_email?: string | null
          signer_ip?: string | null
          signer_name: string
          signer_type: string
          signer_user_agent?: string | null
          token_id?: string | null
        }
        Update: {
          agreement_sha256?: string
          agreement_snapshot?: Json
          id?: string
          loan_id?: string
          organization_id?: string
          signature_image?: string
          signature_method?: string
          signed_at?: string
          signer_email?: string | null
          signer_ip?: string | null
          signer_name?: string
          signer_type?: string
          signer_user_agent?: string | null
          token_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_loan_signatures_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "employee_loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_loan_signatures_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_loan_signatures_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "employee_loan_signature_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_loans: {
        Row: {
          advance_amount: number | null
          advance_cadence: string | null
          agreement_date: string
          borrower_email: string | null
          borrower_name: string
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
          staff_id: string
          status: string
          updated_at: string
          voluntary_ack: boolean
        }
        Insert: {
          advance_amount?: number | null
          advance_cadence?: string | null
          agreement_date: string
          borrower_email?: string | null
          borrower_name: string
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
          staff_id: string
          status?: string
          updated_at?: string
          voluntary_ack?: boolean
        }
        Update: {
          advance_amount?: number | null
          advance_cadence?: string | null
          agreement_date?: string
          borrower_email?: string | null
          borrower_name?: string
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
          staff_id?: string
          status?: string
          updated_at?: string
          voluntary_ack?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "employee_loans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_loans_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "org_member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_loans_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      evv_export_batches: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          batch_number: number
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          range_end: string
          range_start: string
          row_count: number
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          batch_number: number
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          range_end: string
          range_start: string
          row_count?: number
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          batch_number?: number
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          range_end?: string
          range_start?: string
          row_count?: number
        }
        Relationships: []
      }
      evv_export_records: {
        Row: {
          batch_id: string
          created_at: string
          id: string
          is_correction: boolean
          organization_id: string
          orig_record: string | null
          record_id: number
          timesheet_id: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: string
          is_correction?: boolean
          organization_id: string
          orig_record?: string | null
          record_id: number
          timesheet_id: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          is_correction?: boolean
          organization_id?: string
          orig_record?: string | null
          record_id?: number
          timesheet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evv_export_records_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "evv_export_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evv_export_records_orig_record_fkey"
            columns: ["orig_record"]
            isOneToOne: false
            referencedRelation: "evv_export_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evv_export_records_timesheet_id_fkey"
            columns: ["timesheet_id"]
            isOneToOne: false
            referencedRelation: "evv_timesheets"
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
          attested_accurate: boolean
          attested_at: string | null
          billed_units: number | null
          client_id: string
          clock_in_timestamp: string
          clock_out_timestamp: string | null
          corrected_clock_in: string | null
          corrected_clock_out: string | null
          created_at: string
          day_program_session_id: string | null
          denial_reason: string | null
          denied_at: string | null
          denied_by: string | null
          edit_audit_history_log: Json
          edit_reason: string | null
          edited_at: string | null
          edited_by: string | null
          edited_by_admin_name: string | null
          followup_form_types: string[] | null
          geofence_variance_justification: string | null
          goals_completed: Json
          gps_in_coordinates: Json
          gps_out_coordinates: Json | null
          gps_validated: boolean
          id: string
          import_job_id: string | null
          import_source: string | null
          incident_flag: boolean
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
          review_note: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          rounded_clock_in: string | null
          rounded_clock_out: string | null
          service_type_code: string
          shift_entry_type: string
          shift_note_text: string | null
          staff_confirmed_at: string | null
          staff_confirmed_by: string | null
          staff_flag_reason: string | null
          staff_flagged: boolean
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
          attested_accurate?: boolean
          attested_at?: string | null
          billed_units?: number | null
          client_id: string
          clock_in_timestamp?: string
          clock_out_timestamp?: string | null
          corrected_clock_in?: string | null
          corrected_clock_out?: string | null
          created_at?: string
          day_program_session_id?: string | null
          denial_reason?: string | null
          denied_at?: string | null
          denied_by?: string | null
          edit_audit_history_log?: Json
          edit_reason?: string | null
          edited_at?: string | null
          edited_by?: string | null
          edited_by_admin_name?: string | null
          followup_form_types?: string[] | null
          geofence_variance_justification?: string | null
          goals_completed?: Json
          gps_in_coordinates: Json
          gps_out_coordinates?: Json | null
          gps_validated?: boolean
          id?: string
          import_job_id?: string | null
          import_source?: string | null
          incident_flag?: boolean
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
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          rounded_clock_in?: string | null
          rounded_clock_out?: string | null
          service_type_code: string
          shift_entry_type: string
          shift_note_text?: string | null
          staff_confirmed_at?: string | null
          staff_confirmed_by?: string | null
          staff_flag_reason?: string | null
          staff_flagged?: boolean
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
          attested_accurate?: boolean
          attested_at?: string | null
          billed_units?: number | null
          client_id?: string
          clock_in_timestamp?: string
          clock_out_timestamp?: string | null
          corrected_clock_in?: string | null
          corrected_clock_out?: string | null
          created_at?: string
          day_program_session_id?: string | null
          denial_reason?: string | null
          denied_at?: string | null
          denied_by?: string | null
          edit_audit_history_log?: Json
          edit_reason?: string | null
          edited_at?: string | null
          edited_by?: string | null
          edited_by_admin_name?: string | null
          followup_form_types?: string[] | null
          geofence_variance_justification?: string | null
          goals_completed?: Json
          gps_in_coordinates?: Json
          gps_out_coordinates?: Json | null
          gps_validated?: boolean
          id?: string
          import_job_id?: string | null
          import_source?: string | null
          incident_flag?: boolean
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
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          rounded_clock_in?: string | null
          rounded_clock_out?: string | null
          service_type_code?: string
          shift_entry_type?: string
          shift_note_text?: string | null
          staff_confirmed_at?: string | null
          staff_confirmed_by?: string | null
          staff_flag_reason?: string | null
          staff_flagged?: boolean
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
            foreignKeyName: "evv_timesheets_day_program_session_id_fkey"
            columns: ["day_program_session_id"]
            isOneToOne: false
            referencedRelation: "day_program_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evv_timesheets_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
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
          dismissed_at: string | null
          dismissed_by: string | null
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
          dismissed_at?: string | null
          dismissed_by?: string | null
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
          dismissed_at?: string | null
          dismissed_by?: string | null
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
      feature_registry: {
        Row: {
          category: string
          created_at: string
          default_enabled: boolean
          description: string | null
          feature_key: string
          id: string
          label: string
          parent_key: string | null
          required_tier: string | null
          sort_order: number
          updated_at: string
          upgrade_blurb: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          default_enabled?: boolean
          description?: string | null
          feature_key: string
          id?: string
          label: string
          parent_key?: string | null
          required_tier?: string | null
          sort_order?: number
          updated_at?: string
          upgrade_blurb?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          default_enabled?: boolean
          description?: string | null
          feature_key?: string
          id?: string
          label?: string
          parent_key?: string | null
          required_tier?: string | null
          sort_order?: number
          updated_at?: string
          upgrade_blurb?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_registry_parent_key_fkey"
            columns: ["parent_key"]
            isOneToOne: false
            referencedRelation: "feature_registry"
            referencedColumns: ["feature_key"]
          },
        ]
      }
      feature_upgrade_requests: {
        Row: {
          created_at: string
          feature_key: string
          id: string
          note: string | null
          organization_id: string
          requested_by: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          feature_key: string
          id?: string
          note?: string | null
          organization_id: string
          requested_by: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          feature_key?: string
          id?: string
          note?: string | null
          organization_id?: string
          requested_by?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_upgrade_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          managed_by_requirement: boolean
          name: string
          organization_id: string
          published_at: string | null
          requirement_id: string | null
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
          managed_by_requirement?: boolean
          name: string
          organization_id: string
          published_at?: string | null
          requirement_id?: string | null
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
          managed_by_requirement?: boolean
          name?: string
          organization_id?: string
          published_at?: string | null
          requirement_id?: string | null
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
          {
            foreignKeyName: "forms_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "nectar_requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      functionality_reports: {
        Row: {
          created_at: string
          description: string
          id: string
          organization_id: string | null
          reported_by: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          screen: string | null
          source: Database["public"]["Enums"]["functionality_report_source"]
          status: Database["public"]["Enums"]["functionality_report_status"]
          technical_context: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          organization_id?: string | null
          reported_by?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          screen?: string | null
          source?: Database["public"]["Enums"]["functionality_report_source"]
          status?: Database["public"]["Enums"]["functionality_report_status"]
          technical_context?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          organization_id?: string | null
          reported_by?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          screen?: string | null
          source?: Database["public"]["Enums"]["functionality_report_source"]
          status?: Database["public"]["Enums"]["functionality_report_status"]
          technical_context?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "functionality_reports_organization_id_fkey"
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
      gmail_connections: {
        Row: {
          access_token: string | null
          connected_at: string
          connected_by: string | null
          created_at: string
          disconnected_at: string | null
          google_email: string
          google_sub: string | null
          id: string
          last_error: string | null
          last_history_id: string | null
          last_polled_at: string | null
          organization_id: string
          refresh_token: string | null
          scopes: string[]
          status: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token?: string | null
          connected_at?: string
          connected_by?: string | null
          created_at?: string
          disconnected_at?: string | null
          google_email: string
          google_sub?: string | null
          id?: string
          last_error?: string | null
          last_history_id?: string | null
          last_polled_at?: string | null
          organization_id: string
          refresh_token?: string | null
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string | null
          connected_at?: string
          connected_by?: string | null
          created_at?: string
          disconnected_at?: string | null
          google_email?: string
          google_sub?: string | null
          id?: string
          last_error?: string | null
          last_history_id?: string | null
          last_polled_at?: string | null
          organization_id?: string
          refresh_token?: string | null
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gmail_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      gmail_ingested_messages: {
        Row: {
          error_message: string | null
          from_email: string | null
          gmail_message_id: string
          gmail_thread_id: string | null
          id: string
          ingested_at: string
          internal_date: string | null
          organization_id: string
          outcome: string
          referral_id: string | null
          subject: string | null
        }
        Insert: {
          error_message?: string | null
          from_email?: string | null
          gmail_message_id: string
          gmail_thread_id?: string | null
          id?: string
          ingested_at?: string
          internal_date?: string | null
          organization_id: string
          outcome?: string
          referral_id?: string | null
          subject?: string | null
        }
        Update: {
          error_message?: string | null
          from_email?: string | null
          gmail_message_id?: string
          gmail_thread_id?: string | null
          id?: string
          ingested_at?: string
          internal_date?: string | null
          organization_id?: string
          outcome?: string
          referral_id?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gmail_ingested_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gmail_ingested_messages_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      gmail_ingestion_audit: {
        Row: {
          action: string
          actor_kind: string
          actor_user_id: string | null
          created_at: string
          detail: Json
          gmail_message_id: string | null
          id: string
          organization_id: string
          referral_id: string | null
        }
        Insert: {
          action: string
          actor_kind: string
          actor_user_id?: string | null
          created_at?: string
          detail?: Json
          gmail_message_id?: string | null
          id?: string
          organization_id: string
          referral_id?: string | null
        }
        Update: {
          action?: string
          actor_kind?: string
          actor_user_id?: string | null
          created_at?: string
          detail?: Json
          gmail_message_id?: string | null
          id?: string
          organization_id?: string
          referral_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gmail_ingestion_audit_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gmail_ingestion_audit_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      gmail_ingestion_rules: {
        Row: {
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          label_query: string | null
          organization_id: string
          rule_name: string
          sender_domains: string[]
          sender_emails: string[]
          subject_contains: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          label_query?: string | null
          organization_id: string
          rule_name: string
          sender_domains?: string[]
          sender_emails?: string[]
          subject_contains?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          label_query?: string | null
          organization_id?: string
          rule_name?: string
          sender_domains?: string[]
          sender_emails?: string[]
          subject_contains?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gmail_ingestion_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hhp_cue_cards: {
        Row: {
          address: string | null
          behavioral_comfort: string | null
          commitment_length: string | null
          communication_abilities: string | null
          created_at: string
          created_by: string | null
          criminal_history_flag: boolean
          email: string | null
          experience_summary: string | null
          form_submission_id: string | null
          household_members: Json
          id: string
          independence_levels_accepted: string[]
          linked_staff_user_id: string | null
          location_city: string | null
          location_county: string | null
          medical_comfort: string[]
          name: string
          organization_id: string
          pets: string | null
          phone: string | null
          provider_notes: string | null
          schedule_availability: string | null
          sign_language: boolean
          source: Database["public"]["Enums"]["hhp_cue_card_source"]
          status: Database["public"]["Enums"]["hhp_cue_card_status"]
          updated_at: string
          updated_by: string | null
          wheelchair_accessible: boolean
        }
        Insert: {
          address?: string | null
          behavioral_comfort?: string | null
          commitment_length?: string | null
          communication_abilities?: string | null
          created_at?: string
          created_by?: string | null
          criminal_history_flag?: boolean
          email?: string | null
          experience_summary?: string | null
          form_submission_id?: string | null
          household_members?: Json
          id?: string
          independence_levels_accepted?: string[]
          linked_staff_user_id?: string | null
          location_city?: string | null
          location_county?: string | null
          medical_comfort?: string[]
          name: string
          organization_id: string
          pets?: string | null
          phone?: string | null
          provider_notes?: string | null
          schedule_availability?: string | null
          sign_language?: boolean
          source?: Database["public"]["Enums"]["hhp_cue_card_source"]
          status?: Database["public"]["Enums"]["hhp_cue_card_status"]
          updated_at?: string
          updated_by?: string | null
          wheelchair_accessible?: boolean
        }
        Update: {
          address?: string | null
          behavioral_comfort?: string | null
          commitment_length?: string | null
          communication_abilities?: string | null
          created_at?: string
          created_by?: string | null
          criminal_history_flag?: boolean
          email?: string | null
          experience_summary?: string | null
          form_submission_id?: string | null
          household_members?: Json
          id?: string
          independence_levels_accepted?: string[]
          linked_staff_user_id?: string | null
          location_city?: string | null
          location_county?: string | null
          medical_comfort?: string[]
          name?: string
          organization_id?: string
          pets?: string | null
          phone?: string | null
          provider_notes?: string | null
          schedule_availability?: string | null
          sign_language?: boolean
          source?: Database["public"]["Enums"]["hhp_cue_card_source"]
          status?: Database["public"]["Enums"]["hhp_cue_card_status"]
          updated_at?: string
          updated_by?: string | null
          wheelchair_accessible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "hhp_cue_cards_form_submission_id_fkey"
            columns: ["form_submission_id"]
            isOneToOne: true
            referencedRelation: "form_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hhp_cue_cards_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      hhs_host_home_monthly: {
        Row: {
          activities_amount: number
          client_id: string
          created_at: string
          id: string
          month: number
          notes: string | null
          organization_id: string
          room_and_board_amount: number
          updated_at: string
          updated_by: string | null
          year: number
        }
        Insert: {
          activities_amount?: number
          client_id: string
          created_at?: string
          id?: string
          month: number
          notes?: string | null
          organization_id: string
          room_and_board_amount?: number
          updated_at?: string
          updated_by?: string | null
          year: number
        }
        Update: {
          activities_amount?: number
          client_id?: string
          created_at?: string
          id?: string
          month?: number
          notes?: string | null
          organization_id?: string
          room_and_board_amount?: number
          updated_at?: string
          updated_by?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "hhs_host_home_monthly_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hhs_host_home_monthly_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hhs_host_home_settings: {
        Row: {
          client_id: string
          created_at: string
          hhp_name: string | null
          host_daily_rate: number
          id: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          hhp_name?: string | null
          host_daily_rate?: number
          id?: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          hhp_name?: string | null
          host_daily_rate?: number
          id?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hhs_host_home_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hhs_host_home_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
      hhs_monthly_certifications: {
        Row: {
          away_days: number
          blocked_days: number
          certified_at: string
          certified_by: string
          client_id: string
          id: string
          month: string
          organization_id: string
          present_days: number
        }
        Insert: {
          away_days?: number
          blocked_days?: number
          certified_at?: string
          certified_by: string
          client_id: string
          id?: string
          month: string
          organization_id: string
          present_days?: number
        }
        Update: {
          away_days?: number
          blocked_days?: number
          certified_at?: string
          certified_by?: string
          client_id?: string
          id?: string
          month?: string
          organization_id?: string
          present_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "hhs_monthly_certifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hhs_monthly_certifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
      hive_knowledge: {
        Row: {
          body: string
          category: string
          created_at: string
          id: string
          related_feature_key: string | null
          related_route: string | null
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          category: string
          created_at?: string
          id?: string
          related_feature_key?: string | null
          related_route?: string | null
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          id?: string
          related_feature_key?: string | null
          related_route?: string | null
          slug?: string
          title?: string
          updated_at?: string
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
      hive_training_assignments: {
        Row: {
          completed_at: string | null
          course_id: string
          created_at: string
          expires_at: string | null
          id: string
          order_id: string | null
          organization_id: string
          payment_model: Database["public"]["Enums"]["hive_training_order_model"]
          progress_pct: number
          seat_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["hive_training_assignment_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          course_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          order_id?: string | null
          organization_id: string
          payment_model: Database["public"]["Enums"]["hive_training_order_model"]
          progress_pct?: number
          seat_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["hive_training_assignment_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          course_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          order_id?: string | null
          organization_id?: string
          payment_model?: Database["public"]["Enums"]["hive_training_order_model"]
          progress_pct?: number
          seat_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["hive_training_assignment_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hive_training_assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "hive_training_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hive_training_assignments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "hive_training_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hive_training_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hive_training_assignments_seat_id_fkey"
            columns: ["seat_id"]
            isOneToOne: false
            referencedRelation: "hive_training_seats"
            referencedColumns: ["id"]
          },
        ]
      }
      hive_training_auto_renew_runs: {
        Row: {
          created_at: string
          details: Json
          error_message: string | null
          id: string
          organization_id: string
          run_at: string
          seats_purchased: number
          staff_count: number
          status: Database["public"]["Enums"]["hive_training_auto_renew_status"]
          stripe_payment_intent_id: string | null
          total_amount_cents: number
        }
        Insert: {
          created_at?: string
          details?: Json
          error_message?: string | null
          id?: string
          organization_id: string
          run_at?: string
          seats_purchased?: number
          staff_count?: number
          status: Database["public"]["Enums"]["hive_training_auto_renew_status"]
          stripe_payment_intent_id?: string | null
          total_amount_cents?: number
        }
        Update: {
          created_at?: string
          details?: Json
          error_message?: string | null
          id?: string
          organization_id?: string
          run_at?: string
          seats_purchased?: number
          staff_count?: number
          status?: Database["public"]["Enums"]["hive_training_auto_renew_status"]
          stripe_payment_intent_id?: string | null
          total_amount_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "hive_training_auto_renew_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hive_training_auto_renew_settings: {
        Row: {
          created_at: string
          enabled: boolean
          last_run_at: string | null
          lead_days: number
          organization_id: string
          paused_reason: string | null
          payment_method_brand: string | null
          payment_method_last4: string | null
          scope: Database["public"]["Enums"]["hive_training_auto_renew_scope"]
          selected_catalog_ids: string[]
          stripe_customer_id: string | null
          stripe_payment_method_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          last_run_at?: string | null
          lead_days?: number
          organization_id: string
          paused_reason?: string | null
          payment_method_brand?: string | null
          payment_method_last4?: string | null
          scope?: Database["public"]["Enums"]["hive_training_auto_renew_scope"]
          selected_catalog_ids?: string[]
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          last_run_at?: string | null
          lead_days?: number
          organization_id?: string
          paused_reason?: string | null
          payment_method_brand?: string | null
          payment_method_last4?: string | null
          scope?: Database["public"]["Enums"]["hive_training_auto_renew_scope"]
          selected_catalog_ids?: string[]
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hive_training_auto_renew_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hive_training_catalog: {
        Row: {
          active: boolean
          created_at: string
          currency: string
          fulfills_course_ids: string[]
          id: string
          includes: string[]
          kind: Database["public"]["Enums"]["hive_training_catalog_kind"]
          name: string
          price_cents: number
          sku: string
          sort: number
          stripe_price_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          currency?: string
          fulfills_course_ids?: string[]
          id?: string
          includes?: string[]
          kind: Database["public"]["Enums"]["hive_training_catalog_kind"]
          name: string
          price_cents: number
          sku: string
          sort?: number
          stripe_price_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          currency?: string
          fulfills_course_ids?: string[]
          id?: string
          includes?: string[]
          kind?: Database["public"]["Enums"]["hive_training_catalog_kind"]
          name?: string
          price_cents?: number
          sku?: string
          sort?: number
          stripe_price_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      hive_training_certificates: {
        Row: {
          assignment_id: string
          code: string
          created_at: string
          expires_at: string | null
          id: string
          issued_at: string
          pdf_url: string | null
        }
        Insert: {
          assignment_id: string
          code: string
          created_at?: string
          expires_at?: string | null
          id?: string
          issued_at?: string
          pdf_url?: string | null
        }
        Update: {
          assignment_id?: string
          code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          issued_at?: string
          pdf_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hive_training_certificates_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "hive_training_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      hive_training_course_modules: {
        Row: {
          body_md: string | null
          course_id: string
          created_at: string
          id: string
          quiz_json: Json | null
          sort: number
          title: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          body_md?: string | null
          course_id: string
          created_at?: string
          id?: string
          quiz_json?: Json | null
          sort?: number
          title: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          body_md?: string | null
          course_id?: string
          created_at?: string
          id?: string
          quiz_json?: Json | null
          sort?: number
          title?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hive_training_course_modules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "hive_training_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      hive_training_courses: {
        Row: {
          baseline_key: string | null
          catalog_id: string | null
          cert_validity_months: number
          cover_url: string | null
          created_at: string
          description: string | null
          estimated_minutes: number
          id: string
          published: boolean
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          baseline_key?: string | null
          catalog_id?: string | null
          cert_validity_months?: number
          cover_url?: string | null
          created_at?: string
          description?: string | null
          estimated_minutes?: number
          id?: string
          published?: boolean
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          baseline_key?: string | null
          catalog_id?: string | null
          cert_validity_months?: number
          cover_url?: string | null
          created_at?: string
          description?: string | null
          estimated_minutes?: number
          id?: string
          published?: boolean
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hive_training_courses_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "hive_training_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      hive_training_module_progress: {
        Row: {
          assignment_id: string
          completed_at: string | null
          created_at: string
          id: string
          module_id: string
          quiz_score: number | null
          updated_at: string
        }
        Insert: {
          assignment_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          module_id: string
          quiz_score?: number | null
          updated_at?: string
        }
        Update: {
          assignment_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          module_id?: string
          quiz_score?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hive_training_module_progress_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "hive_training_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hive_training_module_progress_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "hive_training_course_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      hive_training_order_items: {
        Row: {
          catalog_id: string
          created_at: string
          id: string
          order_id: string
          quantity: number
          unit_price_cents: number
        }
        Insert: {
          catalog_id: string
          created_at?: string
          id?: string
          order_id: string
          quantity: number
          unit_price_cents: number
        }
        Update: {
          catalog_id?: string
          created_at?: string
          id?: string
          order_id?: string
          quantity?: number
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "hive_training_order_items_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "hive_training_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hive_training_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "hive_training_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      hive_training_orders: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          id: string
          model: Database["public"]["Enums"]["hive_training_order_model"]
          organization_id: string
          paid_at: string | null
          purchaser_user_id: string
          refunded_at: string | null
          status: Database["public"]["Enums"]["hive_training_order_status"]
          stripe_checkout_session_id: string | null
          stripe_customer_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          currency?: string
          id?: string
          model: Database["public"]["Enums"]["hive_training_order_model"]
          organization_id: string
          paid_at?: string | null
          purchaser_user_id: string
          refunded_at?: string | null
          status?: Database["public"]["Enums"]["hive_training_order_status"]
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          id?: string
          model?: Database["public"]["Enums"]["hive_training_order_model"]
          organization_id?: string
          paid_at?: string | null
          purchaser_user_id?: string
          refunded_at?: string | null
          status?: Database["public"]["Enums"]["hive_training_order_status"]
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hive_training_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hive_training_renewal_intents: {
        Row: {
          catalog_id: string
          consumed_at: string | null
          course_id: string
          created_at: string
          id: string
          organization_id: string
          stripe_session_id: string
          user_id: string
        }
        Insert: {
          catalog_id: string
          consumed_at?: string | null
          course_id: string
          created_at?: string
          id?: string
          organization_id: string
          stripe_session_id: string
          user_id: string
        }
        Update: {
          catalog_id?: string
          consumed_at?: string | null
          course_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          stripe_session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      hive_training_seats: {
        Row: {
          assigned_at: string | null
          assigned_to_user_id: string | null
          catalog_id: string
          consumed_at: string | null
          created_at: string
          id: string
          order_id: string | null
          organization_id: string
          status: Database["public"]["Enums"]["hive_training_seat_status"]
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_to_user_id?: string | null
          catalog_id: string
          consumed_at?: string | null
          created_at?: string
          id?: string
          order_id?: string | null
          organization_id: string
          status?: Database["public"]["Enums"]["hive_training_seat_status"]
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_to_user_id?: string | null
          catalog_id?: string
          consumed_at?: string | null
          created_at?: string
          id?: string
          order_id?: string | null
          organization_id?: string
          status?: Database["public"]["Enums"]["hive_training_seat_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hive_training_seats_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "hive_training_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hive_training_seats_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "hive_training_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hive_training_seats_organization_id_fkey"
            columns: ["organization_id"]
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
      host_home_cert_concerns: {
        Row: {
          certification_id: string
          corrective_action: string
          created_at: string
          finding: string
          id: string
          organization_id: string
          resolution_notes: string | null
          resolved_at: string | null
          target_date: string | null
          updated_at: string
        }
        Insert: {
          certification_id: string
          corrective_action: string
          created_at?: string
          finding: string
          id?: string
          organization_id: string
          resolution_notes?: string | null
          resolved_at?: string | null
          target_date?: string | null
          updated_at?: string
        }
        Update: {
          certification_id?: string
          corrective_action?: string
          created_at?: string
          finding?: string
          id?: string
          organization_id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          target_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "host_home_cert_concerns_certification_id_fkey"
            columns: ["certification_id"]
            isOneToOne: false
            referencedRelation: "host_home_certifications"
            referencedColumns: ["id"]
          },
        ]
      }
      host_home_certifications: {
        Row: {
          attestation_confirmed: boolean
          attestation_text: string | null
          cert_type: string
          certificate_pdf_path: string | null
          checklist: Json
          client_id: string
          created_at: string
          determination: string
          guardian_acknowledgement_name: string | null
          hhp_cue_card_id: string | null
          host_home_address: string
          id: string
          inspection_date: string
          inspector_name: string
          inspector_not_host_confirmed: boolean
          inspector_user_id: string
          next_due_date: string | null
          organization_id: string
          pcsp_notes: string | null
          pcsp_status: string
          signature_name: string
          signature_title: string
          signed_at: string
          team_id: string | null
          updated_at: string
        }
        Insert: {
          attestation_confirmed?: boolean
          attestation_text?: string | null
          cert_type: string
          certificate_pdf_path?: string | null
          checklist?: Json
          client_id: string
          created_at?: string
          determination: string
          guardian_acknowledgement_name?: string | null
          hhp_cue_card_id?: string | null
          host_home_address: string
          id?: string
          inspection_date: string
          inspector_name: string
          inspector_not_host_confirmed?: boolean
          inspector_user_id: string
          next_due_date?: string | null
          organization_id: string
          pcsp_notes?: string | null
          pcsp_status: string
          signature_name: string
          signature_title: string
          signed_at?: string
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          attestation_confirmed?: boolean
          attestation_text?: string | null
          cert_type?: string
          certificate_pdf_path?: string | null
          checklist?: Json
          client_id?: string
          created_at?: string
          determination?: string
          guardian_acknowledgement_name?: string | null
          hhp_cue_card_id?: string | null
          host_home_address?: string
          id?: string
          inspection_date?: string
          inspector_name?: string
          inspector_not_host_confirmed?: boolean
          inspector_user_id?: string
          next_due_date?: string | null
          organization_id?: string
          pcsp_notes?: string | null
          pcsp_status?: string
          signature_name?: string
          signature_title?: string
          signed_at?: string
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "host_home_certifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_home_certifications_hhp_cue_card_id_fkey"
            columns: ["hhp_cue_card_id"]
            isOneToOne: false
            referencedRelation: "hhp_cue_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      host_supervision_contacts: {
        Row: {
          client_id: string
          conducted_by: string | null
          contact_date: string
          contact_type: string
          created_at: string
          id: string
          organization_id: string
          summary: string | null
        }
        Insert: {
          client_id: string
          conducted_by?: string | null
          contact_date: string
          contact_type?: string
          created_at?: string
          id?: string
          organization_id: string
          summary?: string | null
        }
        Update: {
          client_id?: string
          conducted_by?: string | null
          contact_date?: string
          contact_type?: string
          created_at?: string
          id?: string
          organization_id?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "host_supervision_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
          client_key: string | null
          client_label: string | null
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
          client_key?: string | null
          client_label?: string | null
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
          client_key?: string | null
          client_label?: string | null
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
      import_merge_flags: {
        Row: {
          client_id: string
          created_at: string
          existing_value: string | null
          field: string
          id: string
          import_job_id: string | null
          incoming_value: string | null
          kind: string
          organization_id: string
          resolved_action: string | null
          resolved_at: string | null
          resolved_by: string | null
          source_document_type: string | null
          suggested_value: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          existing_value?: string | null
          field: string
          id?: string
          import_job_id?: string | null
          incoming_value?: string | null
          kind: string
          organization_id: string
          resolved_action?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source_document_type?: string | null
          suggested_value?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          existing_value?: string | null
          field?: string
          id?: string
          import_job_id?: string | null
          incoming_value?: string | null
          kind?: string
          organization_id?: string
          resolved_action?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          source_document_type?: string | null
          suggested_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_merge_flags_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_merge_flags_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
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
          discarded_at: string | null
          discarded_by: string | null
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
          validation_overrides: Json
        }
        Insert: {
          commit_error?: string | null
          committed_at?: string | null
          committed_record_id?: string | null
          created_at?: string
          discarded_at?: string | null
          discarded_by?: string | null
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
          validation_overrides?: Json
        }
        Update: {
          commit_error?: string | null
          committed_at?: string | null
          committed_record_id?: string | null
          created_at?: string
          discarded_at?: string | null
          discarded_by?: string | null
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
          validation_overrides?: Json
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
          ai_review_at: string | null
          ai_review_issues: Json | null
          ai_review_status: string | null
          ai_trigger_reasons: string[] | null
          amendment_reason: string | null
          aps_notified: boolean | null
          aps_notified_at: string | null
          aps_notified_by: string | null
          aps_reference: string | null
          category: string | null
          client_id: string
          created_at: string
          description: string | null
          details: Json
          discovered_at: string | null
          family_name: string | null
          family_notified: boolean | null
          family_notified_at: string | null
          filed_at: string
          followup_notes: string | null
          guardian_attestation_text: string | null
          guardian_notified_at: string | null
          guardian_notified_by: string | null
          guardian_notified_method: string | null
          guardian_signed_at: string | null
          guardian_signed_name: string | null
          guardian_signed_title: string | null
          id: string
          immediate_actions: string
          incident_address: string | null
          incident_city: string | null
          incident_date: string
          incident_state: string | null
          incident_time: string
          incident_types: string[]
          incident_zip: string | null
          injuries: string | null
          is_abuse_neglect: boolean
          is_fatality: boolean
          law_enforcement_called: boolean | null
          location: string | null
          location_detail: string | null
          location_type: string | null
          medical_attention: string | null
          medical_attention_required: boolean | null
          medical_facility: string | null
          medical_outcome: string | null
          medical_response_type: string | null
          narrative_after: string
          narrative_before: string
          narrative_during: string
          occurred_at: string | null
          organization_id: string
          other_individuals: Json | null
          people_involved: string | null
          prevention_strategies: string | null
          report_number: string
          reported_by: string
          reported_to_reporter_by: string | null
          reporter_title: string | null
          restraint_used: boolean
          sc_update_attestation_text: string | null
          sc_update_notes: string | null
          sc_update_signed_at: string | null
          sc_update_signed_by: string | null
          sc_update_signed_name: string | null
          sc_update_signed_title: string | null
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
          upi_completed_at: string | null
          upi_completed_attestation_text: string | null
          upi_completed_by: string | null
          upi_completed_signed_name: string | null
          upi_completed_signed_title: string | null
          upi_initiated_at: string | null
          upi_initiated_attestation_text: string | null
          upi_initiated_by: string | null
          upi_initiated_signed_name: string | null
          upi_initiated_signed_title: string | null
          witnessed_directly: boolean | null
          witnesses: Json | null
        }
        Insert: {
          additional_client_ids?: string[] | null
          ai_review_at?: string | null
          ai_review_issues?: Json | null
          ai_review_status?: string | null
          ai_trigger_reasons?: string[] | null
          amendment_reason?: string | null
          aps_notified?: boolean | null
          aps_notified_at?: string | null
          aps_notified_by?: string | null
          aps_reference?: string | null
          category?: string | null
          client_id: string
          created_at?: string
          description?: string | null
          details?: Json
          discovered_at?: string | null
          family_name?: string | null
          family_notified?: boolean | null
          family_notified_at?: string | null
          filed_at?: string
          followup_notes?: string | null
          guardian_attestation_text?: string | null
          guardian_notified_at?: string | null
          guardian_notified_by?: string | null
          guardian_notified_method?: string | null
          guardian_signed_at?: string | null
          guardian_signed_name?: string | null
          guardian_signed_title?: string | null
          id?: string
          immediate_actions?: string
          incident_address?: string | null
          incident_city?: string | null
          incident_date: string
          incident_state?: string | null
          incident_time: string
          incident_types?: string[]
          incident_zip?: string | null
          injuries?: string | null
          is_abuse_neglect?: boolean
          is_fatality?: boolean
          law_enforcement_called?: boolean | null
          location?: string | null
          location_detail?: string | null
          location_type?: string | null
          medical_attention?: string | null
          medical_attention_required?: boolean | null
          medical_facility?: string | null
          medical_outcome?: string | null
          medical_response_type?: string | null
          narrative_after?: string
          narrative_before?: string
          narrative_during?: string
          occurred_at?: string | null
          organization_id: string
          other_individuals?: Json | null
          people_involved?: string | null
          prevention_strategies?: string | null
          report_number: string
          reported_by: string
          reported_to_reporter_by?: string | null
          reporter_title?: string | null
          restraint_used?: boolean
          sc_update_attestation_text?: string | null
          sc_update_notes?: string | null
          sc_update_signed_at?: string | null
          sc_update_signed_by?: string | null
          sc_update_signed_name?: string | null
          sc_update_signed_title?: string | null
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
          upi_completed_at?: string | null
          upi_completed_attestation_text?: string | null
          upi_completed_by?: string | null
          upi_completed_signed_name?: string | null
          upi_completed_signed_title?: string | null
          upi_initiated_at?: string | null
          upi_initiated_attestation_text?: string | null
          upi_initiated_by?: string | null
          upi_initiated_signed_name?: string | null
          upi_initiated_signed_title?: string | null
          witnessed_directly?: boolean | null
          witnesses?: Json | null
        }
        Update: {
          additional_client_ids?: string[] | null
          ai_review_at?: string | null
          ai_review_issues?: Json | null
          ai_review_status?: string | null
          ai_trigger_reasons?: string[] | null
          amendment_reason?: string | null
          aps_notified?: boolean | null
          aps_notified_at?: string | null
          aps_notified_by?: string | null
          aps_reference?: string | null
          category?: string | null
          client_id?: string
          created_at?: string
          description?: string | null
          details?: Json
          discovered_at?: string | null
          family_name?: string | null
          family_notified?: boolean | null
          family_notified_at?: string | null
          filed_at?: string
          followup_notes?: string | null
          guardian_attestation_text?: string | null
          guardian_notified_at?: string | null
          guardian_notified_by?: string | null
          guardian_notified_method?: string | null
          guardian_signed_at?: string | null
          guardian_signed_name?: string | null
          guardian_signed_title?: string | null
          id?: string
          immediate_actions?: string
          incident_address?: string | null
          incident_city?: string | null
          incident_date?: string
          incident_state?: string | null
          incident_time?: string
          incident_types?: string[]
          incident_zip?: string | null
          injuries?: string | null
          is_abuse_neglect?: boolean
          is_fatality?: boolean
          law_enforcement_called?: boolean | null
          location?: string | null
          location_detail?: string | null
          location_type?: string | null
          medical_attention?: string | null
          medical_attention_required?: boolean | null
          medical_facility?: string | null
          medical_outcome?: string | null
          medical_response_type?: string | null
          narrative_after?: string
          narrative_before?: string
          narrative_during?: string
          occurred_at?: string | null
          organization_id?: string
          other_individuals?: Json | null
          people_involved?: string | null
          prevention_strategies?: string | null
          report_number?: string
          reported_by?: string
          reported_to_reporter_by?: string | null
          reporter_title?: string | null
          restraint_used?: boolean
          sc_update_attestation_text?: string | null
          sc_update_notes?: string | null
          sc_update_signed_at?: string | null
          sc_update_signed_by?: string | null
          sc_update_signed_name?: string | null
          sc_update_signed_title?: string | null
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
          upi_completed_at?: string | null
          upi_completed_attestation_text?: string | null
          upi_completed_by?: string | null
          upi_completed_signed_name?: string | null
          upi_completed_signed_title?: string | null
          upi_initiated_at?: string | null
          upi_initiated_attestation_text?: string | null
          upi_initiated_by?: string | null
          upi_initiated_signed_name?: string | null
          upi_initiated_signed_title?: string | null
          witnessed_directly?: boolean | null
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
      incident_sc_requests: {
        Row: {
          created_at: string
          id: string
          incident_id: string
          organization_id: string
          request_summary: string
          requested_at: string
          responded_at: string | null
          responded_by: string | null
          response_summary: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          incident_id: string
          organization_id: string
          request_summary: string
          requested_at: string
          responded_at?: string | null
          responded_by?: string | null
          response_summary?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          incident_id?: string
          organization_id?: string
          request_summary?: string
          requested_at?: string
          responded_at?: string | null
          responded_by?: string | null
          response_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incident_sc_requests_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incident_reports"
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
      master_attestations: {
        Row: {
          attestation_text: string
          id: string
          organization_id: string
          requirement_count: number
          scope_codes: string[]
          signed_at: string
          signed_by: string
          signed_by_name: string | null
          superseded_at: string | null
          version: number
        }
        Insert: {
          attestation_text: string
          id?: string
          organization_id: string
          requirement_count?: number
          scope_codes?: string[]
          signed_at?: string
          signed_by: string
          signed_by_name?: string | null
          superseded_at?: string | null
          version: number
        }
        Update: {
          attestation_text?: string
          id?: string
          organization_id?: string
          requirement_count?: number
          scope_codes?: string[]
          signed_at?: string
          signed_by?: string
          signed_by_name?: string | null
          superseded_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "master_attestations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_transfers: {
        Row: {
          client_id: string
          created_at: string
          from_location: string
          id: string
          medication_id: string
          notes: string | null
          organization_id: string
          quantity: number
          received_by_name: string
          received_signature: string | null
          released_by_name: string | null
          released_by_staff_id: string
          released_signature: string | null
          to_location: string
          transferred_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          from_location: string
          id?: string
          medication_id: string
          notes?: string | null
          organization_id: string
          quantity: number
          received_by_name: string
          received_signature?: string | null
          released_by_name?: string | null
          released_by_staff_id: string
          released_signature?: string | null
          to_location: string
          transferred_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          from_location?: string
          id?: string
          medication_id?: string
          notes?: string | null
          organization_id?: string
          quantity?: number
          received_by_name?: string
          received_signature?: string | null
          released_by_name?: string | null
          released_by_staff_id?: string
          released_signature?: string | null
          to_location?: string
          transferred_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_transfers_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "client_medications"
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
      nectar_code_activations: {
        Row: {
          confirmed_at: string
          confirmed_by: string
          created_at: string
          deactivated_at: string | null
          deactivated_by: string | null
          id: string
          organization_id: string
          requirement_count_at_confirm: number
          service_code: string
        }
        Insert: {
          confirmed_at?: string
          confirmed_by: string
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          id?: string
          organization_id: string
          requirement_count_at_confirm?: number
          service_code: string
        }
        Update: {
          confirmed_at?: string
          confirmed_by?: string
          created_at?: string
          deactivated_at?: string | null
          deactivated_by?: string | null
          id?: string
          organization_id?: string
          requirement_count_at_confirm?: number
          service_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "nectar_code_activations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      nectar_compliance_flags: {
        Row: {
          detection_type: string
          id: string
          organization_id: string
          raised_at: string
          raised_to: string | null
          requirement_id: string
          resolution: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          rule_id: string
          source_snapshot: Json
          subject_context: Json
        }
        Insert: {
          detection_type: string
          id?: string
          organization_id: string
          raised_at?: string
          raised_to?: string | null
          requirement_id: string
          resolution?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id: string
          source_snapshot?: Json
          subject_context?: Json
        }
        Update: {
          detection_type?: string
          id?: string
          organization_id?: string
          raised_at?: string
          raised_to?: string | null
          requirement_id?: string
          resolution?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          rule_id?: string
          source_snapshot?: Json
          subject_context?: Json
        }
        Relationships: [
          {
            foreignKeyName: "nectar_compliance_flags_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nectar_compliance_flags_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "nectar_requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nectar_compliance_flags_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "nectar_compliance_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      nectar_compliance_rule_history: {
        Row: {
          action: string
          actor_id: string | null
          actor_label: string | null
          created_at: string
          id: string
          note: string | null
          organization_id: string
          rule_id: string
          snapshot: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_label?: string | null
          created_at?: string
          id?: string
          note?: string | null
          organization_id: string
          rule_id: string
          snapshot?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_label?: string | null
          created_at?: string
          id?: string
          note?: string | null
          organization_id?: string
          rule_id?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "nectar_compliance_rule_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nectar_compliance_rule_history_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "nectar_compliance_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      nectar_compliance_rules: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          dismissed_at: string | null
          dismissed_by: string | null
          id: string
          organization_id: string
          proposed_by: string
          proposed_rationale: string | null
          requirement_id: string
          rule_definition: Json
          rule_type: string
          status: string
          updated_at: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          id?: string
          organization_id: string
          proposed_by?: string
          proposed_rationale?: string | null
          requirement_id: string
          rule_definition?: Json
          rule_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          id?: string
          organization_id?: string
          proposed_by?: string
          proposed_rationale?: string | null
          requirement_id?: string
          rule_definition?: Json
          rule_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nectar_compliance_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nectar_compliance_rules_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "nectar_requirements"
            referencedColumns: ["id"]
          },
        ]
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
          date_source: Database["public"]["Enums"]["doc_date_source"] | null
          document_type: string
          effective_end: string | null
          effective_from: string | null
          effective_start: string | null
          effective_to: string | null
          effective_to_mode:
            | Database["public"]["Enums"]["doc_effective_to_mode"]
            | null
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
          status: Database["public"]["Enums"]["doc_status"]
          storage_bucket: string
          storage_path: string
          superseded_at: string | null
          superseded_by: string | null
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
          date_source?: Database["public"]["Enums"]["doc_date_source"] | null
          document_type: string
          effective_end?: string | null
          effective_from?: string | null
          effective_start?: string | null
          effective_to?: string | null
          effective_to_mode?:
            | Database["public"]["Enums"]["doc_effective_to_mode"]
            | null
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
          status?: Database["public"]["Enums"]["doc_status"]
          storage_bucket?: string
          storage_path: string
          superseded_at?: string | null
          superseded_by?: string | null
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
          date_source?: Database["public"]["Enums"]["doc_date_source"] | null
          document_type?: string
          effective_end?: string | null
          effective_from?: string | null
          effective_start?: string | null
          effective_to?: string | null
          effective_to_mode?:
            | Database["public"]["Enums"]["doc_effective_to_mode"]
            | null
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
          status?: Database["public"]["Enums"]["doc_status"]
          storage_bucket?: string
          storage_path?: string
          superseded_at?: string | null
          superseded_by?: string | null
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
          {
            foreignKeyName: "nectar_documents_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "nectar_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      nectar_draft_jobs: {
        Row: {
          attempts_started: number
          chunk_attempts: Json
          chunk_durations_ms: number[]
          chunk_failures: Json
          chunk_ranges: Json
          created_at: string
          created_by: string
          document_id: string
          error_message: string | null
          extracted_items: Json
          id: string
          inserted_count: number
          last_attempt_at: string | null
          last_transient_at: string | null
          last_transient_message: string | null
          organization_id: string
          processed_chunks: number
          processed_indices: number[]
          started_at: string
          status: string
          total_chunks: number
          transient_errors: number
          updated_at: string
        }
        Insert: {
          attempts_started?: number
          chunk_attempts?: Json
          chunk_durations_ms?: number[]
          chunk_failures?: Json
          chunk_ranges?: Json
          created_at?: string
          created_by: string
          document_id: string
          error_message?: string | null
          extracted_items?: Json
          id?: string
          inserted_count?: number
          last_attempt_at?: string | null
          last_transient_at?: string | null
          last_transient_message?: string | null
          organization_id: string
          processed_chunks?: number
          processed_indices?: number[]
          started_at?: string
          status?: string
          total_chunks?: number
          transient_errors?: number
          updated_at?: string
        }
        Update: {
          attempts_started?: number
          chunk_attempts?: Json
          chunk_durations_ms?: number[]
          chunk_failures?: Json
          chunk_ranges?: Json
          created_at?: string
          created_by?: string
          document_id?: string
          error_message?: string | null
          extracted_items?: Json
          id?: string
          inserted_count?: number
          last_attempt_at?: string | null
          last_transient_at?: string | null
          last_transient_message?: string | null
          organization_id?: string
          processed_chunks?: number
          processed_indices?: number[]
          started_at?: string
          status?: string
          total_chunks?: number
          transient_errors?: number
          updated_at?: string
        }
        Relationships: []
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
      nectar_rate_state: {
        Row: {
          day_start: string
          day_tokens_used: number
          key: string
          updated_at: string
          window_count: number
          window_start: string
        }
        Insert: {
          day_start?: string
          day_tokens_used?: number
          key: string
          updated_at?: string
          window_count?: number
          window_start?: string
        }
        Update: {
          day_start?: string
          day_tokens_used?: number
          key?: string
          updated_at?: string
          window_count?: number
          window_start?: string
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
      nectar_requirement_category_history: {
        Row: {
          change_source: string
          changed_at: string
          changed_by: string | null
          from_category: string | null
          id: string
          organization_id: string
          requirement_id: string
          to_category: string
        }
        Insert: {
          change_source: string
          changed_at?: string
          changed_by?: string | null
          from_category?: string | null
          id?: string
          organization_id: string
          requirement_id: string
          to_category: string
        }
        Update: {
          change_source?: string
          changed_at?: string
          changed_by?: string | null
          from_category?: string | null
          id?: string
          organization_id?: string
          requirement_id?: string
          to_category?: string
        }
        Relationships: [
          {
            foreignKeyName: "nectar_requirement_category_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nectar_requirement_category_history_requirement_id_fkey"
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
      nectar_requirement_usage: {
        Row: {
          created_at: string
          edit_reason: string | null
          edited_at: string
          edited_by: string
          id: string
          organization_id: string
          requirement_id: string
          supersedes_id: string | null
          usage_note: string
        }
        Insert: {
          created_at?: string
          edit_reason?: string | null
          edited_at?: string
          edited_by: string
          id?: string
          organization_id: string
          requirement_id: string
          supersedes_id?: string | null
          usage_note: string
        }
        Update: {
          created_at?: string
          edit_reason?: string | null
          edited_at?: string
          edited_by?: string
          id?: string
          organization_id?: string
          requirement_id?: string
          supersedes_id?: string | null
          usage_note?: string
        }
        Relationships: [
          {
            foreignKeyName: "nectar_requirement_usage_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nectar_requirement_usage_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "nectar_requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nectar_requirement_usage_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "nectar_requirement_usage"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nectar_requirement_usage_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "nectar_requirement_usage_current_v"
            referencedColumns: ["usage_id"]
          },
        ]
      }
      nectar_requirements: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          activation_state: string
          applies_to: string | null
          approval_state: string | null
          category: string | null
          confirmed_optional: boolean
          created_at: string
          description: string | null
          id: string
          jurisdiction: string | null
          metadata: Json
          obligation_category: string | null
          obligation_category_source: string | null
          organization_id: string
          origin: string
          original_description: string | null
          original_frozen_at: string | null
          original_source_citation: string | null
          original_title: string | null
          requirement_key: string
          review_status: string
          satisfied_by: string | null
          scope_level: string | null
          service_code: string | null
          service_codes_all: string[] | null
          source_citation: string | null
          source_document_id: string | null
          title: string
          updated_at: string
          verified: boolean
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          activation_state?: string
          applies_to?: string | null
          approval_state?: string | null
          category?: string | null
          confirmed_optional?: boolean
          created_at?: string
          description?: string | null
          id?: string
          jurisdiction?: string | null
          metadata?: Json
          obligation_category?: string | null
          obligation_category_source?: string | null
          organization_id: string
          origin?: string
          original_description?: string | null
          original_frozen_at?: string | null
          original_source_citation?: string | null
          original_title?: string | null
          requirement_key: string
          review_status?: string
          satisfied_by?: string | null
          scope_level?: string | null
          service_code?: string | null
          service_codes_all?: string[] | null
          source_citation?: string | null
          source_document_id?: string | null
          title: string
          updated_at?: string
          verified?: boolean
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          activation_state?: string
          applies_to?: string | null
          approval_state?: string | null
          category?: string | null
          confirmed_optional?: boolean
          created_at?: string
          description?: string | null
          id?: string
          jurisdiction?: string | null
          metadata?: Json
          obligation_category?: string | null
          obligation_category_source?: string | null
          organization_id?: string
          origin?: string
          original_description?: string | null
          original_frozen_at?: string | null
          original_source_citation?: string | null
          original_title?: string | null
          requirement_key?: string
          review_status?: string
          satisfied_by?: string | null
          scope_level?: string | null
          service_code?: string | null
          service_codes_all?: string[] | null
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
      org_email_settings: {
        Row: {
          from_address: string | null
          from_name: string
          organization_id: string
          reply_to: string | null
          send_mode: string
          updated_at: string
          updated_by: string | null
          verified: boolean
        }
        Insert: {
          from_address?: string | null
          from_name?: string
          organization_id: string
          reply_to?: string | null
          send_mode?: string
          updated_at?: string
          updated_by?: string | null
          verified?: boolean
        }
        Update: {
          from_address?: string | null
          from_name?: string
          organization_id?: string
          reply_to?: string | null
          send_mode?: string
          updated_at?: string
          updated_by?: string | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "org_email_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
      org_referral_retention_settings: {
        Row: {
          archive_days_after_due: number
          auto_archive_enabled: boolean
          created_at: string
          id: string
          organization_id: string
          purge_grace_days: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archive_days_after_due?: number
          auto_archive_enabled?: boolean
          created_at?: string
          id?: string
          organization_id: string
          purge_grace_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archive_days_after_due?: number
          auto_archive_enabled?: boolean
          created_at?: string
          id?: string
          organization_id?: string
          purge_grace_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_referral_retention_settings_organization_id_fkey"
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
      org_shopping_library: {
        Row: {
          created_at: string
          id: string
          item: string
          last_used_at: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item: string
          last_used_at?: string
          organization_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item?: string
          last_used_at?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_shopping_library_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_subscriptions: {
        Row: {
          billing_interval: string | null
          cancel_at_period_end: boolean
          canceled_at: string | null
          card_expires_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          failure_count: number
          id: string
          last_payment_attempt_at: string | null
          last_payment_error: string | null
          lock_reason: string | null
          locked_at: string | null
          mrr_cents: number
          next_retry_at: string | null
          notes: string | null
          organization_id: string
          past_due_since: string | null
          plan: Database["public"]["Enums"]["sub_plan"]
          renewal_date: string | null
          staff_count: number | null
          started_at: string
          status: Database["public"]["Enums"]["sub_status"]
          stripe_customer_id: string | null
          stripe_payment_method_id: string | null
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          billing_interval?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          card_expires_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          failure_count?: number
          id?: string
          last_payment_attempt_at?: string | null
          last_payment_error?: string | null
          lock_reason?: string | null
          locked_at?: string | null
          mrr_cents?: number
          next_retry_at?: string | null
          notes?: string | null
          organization_id: string
          past_due_since?: string | null
          plan?: Database["public"]["Enums"]["sub_plan"]
          renewal_date?: string | null
          staff_count?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["sub_status"]
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          billing_interval?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          card_expires_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          failure_count?: number
          id?: string
          last_payment_attempt_at?: string | null
          last_payment_error?: string | null
          lock_reason?: string | null
          locked_at?: string | null
          mrr_cents?: number
          next_retry_at?: string | null
          notes?: string | null
          organization_id?: string
          past_due_since?: string | null
          plan?: Database["public"]["Enums"]["sub_plan"]
          renewal_date?: string | null
          staff_count?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["sub_status"]
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          stripe_subscription_id?: string | null
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
      org_training_orders: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          organization_id: string
          selected_modules: Json
          staff_count: number
          status: string
          stripe_payment_intent_id: string | null
          training_type: string
          updated_at: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          id?: string
          organization_id: string
          selected_modules?: Json
          staff_count?: number
          status?: string
          stripe_payment_intent_id?: string | null
          training_type: string
          updated_at?: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          organization_id?: string
          selected_modules?: Json
          staff_count?: number
          status?: string
          stripe_payment_intent_id?: string | null
          training_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_training_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_agreements: {
        Row: {
          created_at: string
          expiration_date: string | null
          file_path: string | null
          id: string
          notes: string | null
          organization_id: string
          renewal_due_date: string | null
          requirement_id: string
          signed_date: string | null
          status: Database["public"]["Enums"]["agreement_status"]
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          expiration_date?: string | null
          file_path?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          renewal_due_date?: string | null
          requirement_id: string
          signed_date?: string | null
          status?: Database["public"]["Enums"]["agreement_status"]
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          expiration_date?: string | null
          file_path?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          renewal_due_date?: string | null
          requirement_id?: string
          signed_date?: string | null
          status?: Database["public"]["Enums"]["agreement_status"]
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_agreements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_agreements_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "agreement_requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_branding: {
        Row: {
          logo_path: string | null
          logo_uploaded_at: string | null
          org_address: string | null
          org_phone: string | null
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          logo_path?: string | null
          logo_uploaded_at?: string | null
          org_address?: string | null
          org_phone?: string | null
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          logo_path?: string | null
          logo_uploaded_at?: string | null
          org_address?: string | null
          org_phone?: string | null
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_branding_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_features: {
        Row: {
          created_at: string
          enabled: boolean
          feature_key: string
          id: string
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          feature_key: string
          id?: string
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          enabled?: boolean
          feature_key?: string
          id?: string
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_features_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "feature_registry"
            referencedColumns: ["feature_key"]
          },
          {
            foreignKeyName: "organization_features_organization_id_fkey"
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
          custom_role_id: string | null
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
          custom_role_id?: string | null
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
          custom_role_id?: string | null
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
            foreignKeyName: "organization_members_custom_role_id_fkey"
            columns: ["custom_role_id"]
            isOneToOne: false
            referencedRelation: "rbac_roles"
            referencedColumns: ["id"]
          },
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
          account_contact_email: string | null
          account_contact_name: string | null
          additional_state_codes: string[]
          aliases: string[]
          approx_client_count: number | null
          billing_sms_phone: string | null
          created_at: string
          created_by: string | null
          dba_name: string | null
          dhhs_provider_id: string | null
          display_acronym: string | null
          evv_vendor_name: string
          id: string
          incident_ai_review_enabled: boolean
          is_demo: boolean
          legal_name: string | null
          logo_url: string | null
          name: string
          nectar_profile_saved_at: string | null
          services_offered: string[] | null
          slug: string
          specializations: string | null
          state_code: string | null
          training_only: boolean
          updated_at: string
        }
        Insert: {
          account_contact_email?: string | null
          account_contact_name?: string | null
          additional_state_codes?: string[]
          aliases?: string[]
          approx_client_count?: number | null
          billing_sms_phone?: string | null
          created_at?: string
          created_by?: string | null
          dba_name?: string | null
          dhhs_provider_id?: string | null
          display_acronym?: string | null
          evv_vendor_name?: string
          id?: string
          incident_ai_review_enabled?: boolean
          is_demo?: boolean
          legal_name?: string | null
          logo_url?: string | null
          name: string
          nectar_profile_saved_at?: string | null
          services_offered?: string[] | null
          slug: string
          specializations?: string | null
          state_code?: string | null
          training_only?: boolean
          updated_at?: string
        }
        Update: {
          account_contact_email?: string | null
          account_contact_name?: string | null
          additional_state_codes?: string[]
          aliases?: string[]
          approx_client_count?: number | null
          billing_sms_phone?: string | null
          created_at?: string
          created_by?: string | null
          dba_name?: string | null
          dhhs_provider_id?: string | null
          display_acronym?: string | null
          evv_vendor_name?: string
          id?: string
          incident_ai_review_enabled?: boolean
          is_demo?: boolean
          legal_name?: string | null
          logo_url?: string | null
          name?: string
          nectar_profile_saved_at?: string | null
          services_offered?: string[] | null
          slug?: string
          specializations?: string | null
          state_code?: string | null
          training_only?: boolean
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
      payment_events: {
        Row: {
          amount_cents: number | null
          created_at: string
          event_type: string
          failure_reason: string | null
          id: string
          metadata: Json | null
          org_id: string
          stripe_event_id: string | null
        }
        Insert: {
          amount_cents?: number | null
          created_at?: string
          event_type: string
          failure_reason?: string | null
          id?: string
          metadata?: Json | null
          org_id: string
          stripe_event_id?: string | null
        }
        Update: {
          amount_cents?: number | null
          created_at?: string
          event_type?: string
          failure_reason?: string | null
          id?: string
          metadata?: Json | null
          org_id?: string
          stripe_event_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
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
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          employee_id: string | null
          end_date: string | null
          evv_consent_timestamp: string | null
          evv_gps_consent_status: string
          first_name: string | null
          full_name: string | null
          has_passed_launchpad: boolean | null
          hire_date: string | null
          home_address: string | null
          hourly_rate: number | null
          id: string
          is_active: boolean
          last_name: string | null
          must_change_password: boolean
          phone: string | null
          photo_path: string | null
          photo_updated_at: string | null
          position: string | null
          positions: string[]
          requires_abi: boolean
          requires_deescalation: boolean
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
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          employee_id?: string | null
          end_date?: string | null
          evv_consent_timestamp?: string | null
          evv_gps_consent_status?: string
          first_name?: string | null
          full_name?: string | null
          has_passed_launchpad?: boolean | null
          hire_date?: string | null
          home_address?: string | null
          hourly_rate?: number | null
          id: string
          is_active?: boolean
          last_name?: string | null
          must_change_password?: boolean
          phone?: string | null
          photo_path?: string | null
          photo_updated_at?: string | null
          position?: string | null
          positions?: string[]
          requires_abi?: boolean
          requires_deescalation?: boolean
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
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          employee_id?: string | null
          end_date?: string | null
          evv_consent_timestamp?: string | null
          evv_gps_consent_status?: string
          first_name?: string | null
          full_name?: string | null
          has_passed_launchpad?: boolean | null
          hire_date?: string | null
          home_address?: string | null
          hourly_rate?: number | null
          id?: string
          is_active?: boolean
          last_name?: string | null
          must_change_password?: boolean
          phone?: string | null
          photo_path?: string | null
          photo_updated_at?: string | null
          position?: string | null
          positions?: string[]
          requires_abi?: boolean
          requires_deescalation?: boolean
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
          archived_at: string | null
          carve_out: boolean
          code: string
          confirmed_at: string | null
          confirmed_by: string | null
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
          archived_at?: string | null
          carve_out?: boolean
          code: string
          confirmed_at?: string | null
          confirmed_by?: string | null
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
          archived_at?: string | null
          carve_out?: boolean
          code?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
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
      provider_interest_outline: {
        Row: {
          codes_held: string[]
          created_at: string
          disability_levels_served: string[]
          disability_types_served: string[]
          id: string
          location_mode: string
          location_values: string[]
          match_weights: Json
          name: string
          need_levels_served: string[]
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          codes_held?: string[]
          created_at?: string
          disability_levels_served?: string[]
          disability_types_served?: string[]
          id?: string
          location_mode?: string
          location_values?: string[]
          match_weights?: Json
          name?: string
          need_levels_served?: string[]
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          codes_held?: string[]
          created_at?: string
          disability_levels_served?: string[]
          disability_types_served?: string[]
          id?: string
          location_mode?: string
          location_values?: string[]
          match_weights?: Json
          name?: string
          need_levels_served?: string[]
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_interest_outline_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      rbac_roles: {
        Row: {
          capabilities: string[]
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          capabilities?: string[]
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          capabilities?: string[]
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rbac_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_shift_patterns: {
        Row: {
          active: boolean
          client_id: string | null
          created_at: string
          created_by: string | null
          crosses_midnight: boolean
          effective_from: string
          effective_until: string | null
          end_time_local: string
          id: string
          location_id: string | null
          name: string | null
          notes: string | null
          organization_id: string
          rotation_group_id: string | null
          service_code_id: string | null
          staff_id: string | null
          start_time_local: string
          updated_at: string
          weekday_mask: number
        }
        Insert: {
          active?: boolean
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          crosses_midnight?: boolean
          effective_from?: string
          effective_until?: string | null
          end_time_local: string
          id?: string
          location_id?: string | null
          name?: string | null
          notes?: string | null
          organization_id: string
          rotation_group_id?: string | null
          service_code_id?: string | null
          staff_id?: string | null
          start_time_local: string
          updated_at?: string
          weekday_mask?: number
        }
        Update: {
          active?: boolean
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          crosses_midnight?: boolean
          effective_from?: string
          effective_until?: string | null
          end_time_local?: string
          id?: string
          location_id?: string | null
          name?: string | null
          notes?: string | null
          organization_id?: string
          rotation_group_id?: string | null
          service_code_id?: string | null
          staff_id?: string | null
          start_time_local?: string
          updated_at?: string
          weekday_mask?: number
        }
        Relationships: []
      }
      referral_activities: {
        Row: {
          activity_type: string
          body: string | null
          channel: string | null
          created_at: string
          created_by: string | null
          id: string
          occurred_at: string
          organization_id: string
          referral_id: string
          stage_from: string | null
          stage_to: string | null
          supersedes_id: string | null
        }
        Insert: {
          activity_type: string
          body?: string | null
          channel?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          occurred_at?: string
          organization_id: string
          referral_id: string
          stage_from?: string | null
          stage_to?: string | null
          supersedes_id?: string | null
        }
        Update: {
          activity_type?: string
          body?: string | null
          channel?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          occurred_at?: string
          organization_id?: string
          referral_id?: string
          stage_from?: string | null
          stage_to?: string | null
          supersedes_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_activities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_activities_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_activities_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "referral_activities"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_documents: {
        Row: {
          created_at: string
          draft_key: string | null
          file_name: string
          id: string
          mime_type: string | null
          organization_id: string
          parse_error: string | null
          parse_status: string
          parsed_fields: Json | null
          referral_id: string | null
          size_bytes: number | null
          storage_bucket: string
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          draft_key?: string | null
          file_name: string
          id?: string
          mime_type?: string | null
          organization_id: string
          parse_error?: string | null
          parse_status?: string
          parsed_fields?: Json | null
          referral_id?: string | null
          size_bytes?: number | null
          storage_bucket?: string
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          draft_key?: string | null
          file_name?: string
          id?: string
          mime_type?: string | null
          organization_id?: string
          parse_error?: string | null
          parse_status?: string
          parsed_fields?: Json | null
          referral_id?: string | null
          size_bytes?: number | null
          storage_bucket?: string
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_documents_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_match_scores: {
        Row: {
          best_host_ids: string[]
          code_overlap: number
          computed_at: string
          disability_fit: number
          host_fit: number
          id: string
          location_fit: number
          need_fit: number
          organization_id: string
          overall_score: number
          reasons: Json
          referral_id: string
          scored_components: string[]
          weights: Json
        }
        Insert: {
          best_host_ids?: string[]
          code_overlap: number
          computed_at?: string
          disability_fit: number
          host_fit: number
          id?: string
          location_fit: number
          need_fit: number
          organization_id: string
          overall_score: number
          reasons?: Json
          referral_id: string
          scored_components?: string[]
          weights?: Json
        }
        Update: {
          best_host_ids?: string[]
          code_overlap?: number
          computed_at?: string
          disability_fit?: number
          host_fit?: number
          id?: string
          location_fit?: number
          need_fit?: number
          organization_id?: string
          overall_score?: number
          reasons?: Json
          referral_id?: string
          scored_components?: string[]
          weights?: Json
        }
        Relationships: [
          {
            foreignKeyName: "referral_match_scores_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_match_scores_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: true
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_purge_tombstones: {
        Row: {
          archive_reason: string | null
          archived_at: string
          decision_outcome: string | null
          discarded: boolean
          gmail_message_id: string | null
          id: string
          organization_id: string
          purged_at: string
          referral_id: string
        }
        Insert: {
          archive_reason?: string | null
          archived_at: string
          decision_outcome?: string | null
          discarded?: boolean
          gmail_message_id?: string | null
          id?: string
          organization_id: string
          purged_at?: string
          referral_id: string
        }
        Update: {
          archive_reason?: string | null
          archived_at?: string
          decision_outcome?: string | null
          discarded?: boolean
          gmail_message_id?: string | null
          id?: string
          organization_id?: string
          purged_at?: string
          referral_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_purge_tombstones_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          age: number | null
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          budget_note: string | null
          category: string | null
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          decision_outcome: string | null
          decision_reason: string | null
          description: string | null
          disability_level: string | null
          disability_types: string[]
          discard_reason: string | null
          discarded_at: string | null
          discarded_by: string | null
          due_date: string | null
          first_name: string
          gender: string | null
          id: string
          location_city: string | null
          location_county: string | null
          need_level: string | null
          notes: string | null
          organization_id: string
          purge_after: string | null
          requested_codes: string[]
          source: string
          stage: string
          stage_entered_at: string
          status: string
          support_coordinator_id: string | null
          updated_at: string
        }
        Insert: {
          age?: number | null
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          budget_note?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          decision_outcome?: string | null
          decision_reason?: string | null
          description?: string | null
          disability_level?: string | null
          disability_types?: string[]
          discard_reason?: string | null
          discarded_at?: string | null
          discarded_by?: string | null
          due_date?: string | null
          first_name: string
          gender?: string | null
          id?: string
          location_city?: string | null
          location_county?: string | null
          need_level?: string | null
          notes?: string | null
          organization_id: string
          purge_after?: string | null
          requested_codes?: string[]
          source?: string
          stage?: string
          stage_entered_at?: string
          status?: string
          support_coordinator_id?: string | null
          updated_at?: string
        }
        Update: {
          age?: number | null
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          budget_note?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          decision_outcome?: string | null
          decision_reason?: string | null
          description?: string | null
          disability_level?: string | null
          disability_types?: string[]
          discard_reason?: string | null
          discarded_at?: string | null
          discarded_by?: string | null
          due_date?: string | null
          first_name?: string
          gender?: string | null
          id?: string
          location_city?: string | null
          location_county?: string | null
          need_level?: string | null
          notes?: string | null
          organization_id?: string
          purge_after?: string | null
          requested_codes?: string[]
          source?: string
          stage?: string
          stage_entered_at?: string
          status?: string
          support_coordinator_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_support_coordinator_id_fkey"
            columns: ["support_coordinator_id"]
            isOneToOne: false
            referencedRelation: "support_coordinators"
            referencedColumns: ["id"]
          },
        ]
      }
      requirement_bindings: {
        Row: {
          bound_by: string | null
          created_at: string
          engine_ref: string | null
          id: string
          native_feature: string | null
          notes: string | null
          requirement_id: string
          satisfied_by: string
          updated_at: string
        }
        Insert: {
          bound_by?: string | null
          created_at?: string
          engine_ref?: string | null
          id?: string
          native_feature?: string | null
          notes?: string | null
          requirement_id: string
          satisfied_by?: string
          updated_at?: string
        }
        Update: {
          bound_by?: string | null
          created_at?: string
          engine_ref?: string | null
          id?: string
          native_feature?: string | null
          notes?: string | null
          requirement_id?: string
          satisfied_by?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "requirement_bindings_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: true
            referencedRelation: "nectar_requirements"
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
          claim_requested_by: string | null
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
          staff_id: string | null
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          callout_reason?: string | null
          claim_requested_by?: string | null
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
          staff_id?: string | null
          starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          callout_reason?: string | null
          claim_requested_by?: string | null
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
          staff_id?: string | null
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_shifts_claim_requested_by_fkey"
            columns: ["claim_requested_by"]
            isOneToOne: false
            referencedRelation: "org_member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_shifts_claim_requested_by_fkey"
            columns: ["claim_requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
          allowed_on_segment: boolean
          asleep_billable: boolean
          carve_out: boolean
          category: string
          code: string
          created_at: string
          default_rate: number | null
          id: string
          is_active: boolean
          is_living_arrangement: boolean
          max_daily_hours: number | null
          max_weekly_hours: number | null
          name: string | null
          organization_id: string
          rate_source: string
          requires_evv: boolean
          requires_schedule: boolean
          scheduling_behavior: string
          summary_cadence: string
          unit: string
          updated_at: string
        }
        Insert: {
          allowed_on_segment?: boolean
          asleep_billable?: boolean
          carve_out?: boolean
          category: string
          code: string
          created_at?: string
          default_rate?: number | null
          id?: string
          is_active?: boolean
          is_living_arrangement?: boolean
          max_daily_hours?: number | null
          max_weekly_hours?: number | null
          name?: string | null
          organization_id: string
          rate_source?: string
          requires_evv?: boolean
          requires_schedule?: boolean
          scheduling_behavior: string
          summary_cadence?: string
          unit: string
          updated_at?: string
        }
        Update: {
          allowed_on_segment?: boolean
          asleep_billable?: boolean
          carve_out?: boolean
          category?: string
          code?: string
          created_at?: string
          default_rate?: number | null
          id?: string
          is_active?: boolean
          is_living_arrangement?: boolean
          max_daily_hours?: number | null
          max_weekly_hours?: number | null
          name?: string | null
          organization_id?: string
          rate_source?: string
          requires_evv?: boolean
          requires_schedule?: boolean
          scheduling_behavior?: string
          summary_cadence?: string
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
      staff_baseline_training_completions: {
        Row: {
          admin_signed_off_at: string | null
          admin_signed_off_by: string | null
          completed_by: string | null
          completed_date: string | null
          created_at: string
          evidence_document_id: string | null
          expires_at: string | null
          id: string
          nectar_extracted_cert_type: string | null
          nectar_extracted_completed_date: string | null
          nectar_extracted_name: string | null
          nectar_extracted_summary: string | null
          nectar_name_match: string | null
          nectar_reviewed_at: string | null
          nectar_suggested_expires: boolean
          nectar_validation_reasons: Json | null
          nectar_validation_status: string | null
          notes: string | null
          organization_id: string
          staff_id: string
          training_key: string
          updated_at: string
        }
        Insert: {
          admin_signed_off_at?: string | null
          admin_signed_off_by?: string | null
          completed_by?: string | null
          completed_date?: string | null
          created_at?: string
          evidence_document_id?: string | null
          expires_at?: string | null
          id?: string
          nectar_extracted_cert_type?: string | null
          nectar_extracted_completed_date?: string | null
          nectar_extracted_name?: string | null
          nectar_extracted_summary?: string | null
          nectar_name_match?: string | null
          nectar_reviewed_at?: string | null
          nectar_suggested_expires?: boolean
          nectar_validation_reasons?: Json | null
          nectar_validation_status?: string | null
          notes?: string | null
          organization_id: string
          staff_id: string
          training_key: string
          updated_at?: string
        }
        Update: {
          admin_signed_off_at?: string | null
          admin_signed_off_by?: string | null
          completed_by?: string | null
          completed_date?: string | null
          created_at?: string
          evidence_document_id?: string | null
          expires_at?: string | null
          id?: string
          nectar_extracted_cert_type?: string | null
          nectar_extracted_completed_date?: string | null
          nectar_extracted_name?: string | null
          nectar_extracted_summary?: string | null
          nectar_name_match?: string | null
          nectar_reviewed_at?: string | null
          nectar_suggested_expires?: boolean
          nectar_validation_reasons?: Json | null
          nectar_validation_status?: string | null
          notes?: string | null
          organization_id?: string
          staff_id?: string
          training_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_baseline_training_completions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
      staff_rotation_group_members: {
        Row: {
          created_at: string
          group_id: string
          id: string
          sort_order: number
          staff_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          sort_order?: number
          staff_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          sort_order?: number
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_rotation_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "staff_rotation_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_rotation_groups: {
        Row: {
          created_at: string
          id: string
          last_assigned_staff_id: string | null
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_assigned_staff_id?: string | null
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_assigned_staff_id?: string | null
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: []
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
      support_coordinators: {
        Row: {
          agency: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          name: string
          organization_id: string
          phone: string | null
          region: string | null
          updated_at: string
        }
        Insert: {
          agency?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          organization_id: string
          phone?: string | null
          region?: string | null
          updated_at?: string
        }
        Update: {
          agency?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          organization_id?: string
          phone?: string | null
          region?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_coordinators_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          content_snapshot: Json | null
          content_version: string | null
          dspd_letter: string | null
          id: string
          ip_address: string | null
          is_current: boolean
          question_answers: Json
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
          content_snapshot?: Json | null
          content_version?: string | null
          dspd_letter?: string | null
          id?: string
          ip_address?: string | null
          is_current?: boolean
          question_answers?: Json
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
          content_snapshot?: Json | null
          content_version?: string | null
          dspd_letter?: string | null
          id?: string
          ip_address?: string | null
          is_current?: boolean
          question_answers?: Json
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
      user_capability_overrides: {
        Row: {
          capability_key: string
          created_at: string
          created_by: string | null
          id: string
          mode: string
          organization_id: string
          reason: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          capability_key: string
          created_at?: string
          created_by?: string | null
          id?: string
          mode: string
          organization_id: string
          reason?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          capability_key?: string
          created_at?: string
          created_by?: string | null
          id?: string
          mode?: string
          organization_id?: string
          reason?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_capability_overrides_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      user_ui_dismissals: {
        Row: {
          dismissed_at: string
          id: string
          pref_key: string
          user_id: string
        }
        Insert: {
          dismissed_at?: string
          id?: string
          pref_key: string
          user_id: string
        }
        Update: {
          dismissed_at?: string
          id?: string
          pref_key?: string
          user_id?: string
        }
        Relationships: []
      }
      week_templates: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          organization_id: string
          payload: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          organization_id: string
          payload: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          organization_id?: string
          payload?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "week_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "org_member_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "week_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "week_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      whiteboard_notes: {
        Row: {
          created_at: string
          created_by: string
          id: string
          note_text: string
          organization_id: string
          subject_id: string
          subject_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          note_text: string
          organization_id: string
          subject_id: string
          subject_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          note_text?: string
          organization_id?: string
          subject_id?: string
          subject_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whiteboard_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      day_program_billable_v: {
        Row: {
          activity_note: string | null
          attendance_id: string | null
          billed_mode: string | null
          billed_rate: number | null
          billed_units: number | null
          cap_snapshot: number | null
          client_id: string | null
          dollars: number | null
          organization_id: string | null
          row_kind: string | null
          service_code: string | null
          session_date: string | null
          session_id: string | null
        }
        Relationships: []
      }
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
      hhs_daily_records_v: {
        Row: {
          billable: boolean | null
          blocked_reason: string | null
          client_id: string | null
          organization_id: string | null
          rate_per_unit: number | null
          record_date: string | null
          service_code: string | null
        }
        Relationships: []
      }
      mcp_column_catalog: {
        Row: {
          column_name: unknown
          data_type: string | null
          is_nullable: string | null
          ordinal_position: number | null
          table_name: unknown
        }
        Relationships: []
      }
      mcp_table_catalog: {
        Row: {
          table_name: unknown
        }
        Relationships: []
      }
      nectar_requirement_usage_current_v: {
        Row: {
          edited_at: string | null
          edited_by: string | null
          organization_id: string | null
          requirement_id: string | null
          usage_id: string | null
          usage_note: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nectar_requirement_usage_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nectar_requirement_usage_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "nectar_requirements"
            referencedColumns: ["id"]
          },
        ]
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
      archive_eligible_referrals: {
        Args: { _organization_id: string }
        Returns: number
      }
      can_access_import_job: { Args: { _job_id: string }; Returns: boolean }
      can_view_client_intake: {
        Args: { _client: string; _org: string; _viewer: string }
        Returns: boolean
      }
      can_view_staff_pii: {
        Args: { _org: string; _staff: string; _viewer: string }
        Returns: boolean
      }
      client_deletion_impact: { Args: { _client_id: string }; Returns: Json }
      clients_for_staff: {
        Args: { _org: string; _staff: string }
        Returns: {
          account_status: string
          admin_hours_per_week: number | null
          admission_date: string | null
          advanced_directives: boolean | null
          allergies: string[]
          authorized_dspd_codes: string[]
          bsp_status: string | null
          chronic_conditions: string[] | null
          client_photo_taken_on: string | null
          client_photo_url: string | null
          client_pid: string | null
          clinical_alert: string | null
          court_orders: string[] | null
          created_at: string
          date_of_birth: string | null
          day_program_provider: string | null
          dentist_address: string | null
          dentist_name: string | null
          dentist_phone: string | null
          diagnoses: string[] | null
          dietary_needs: string | null
          disability_category: string | null
          discharge_date: string | null
          dnr_applicable: boolean
          dnr_location: string | null
          dnr_status: string | null
          dysphagia: boolean
          emergency_contact_2_address: string | null
          emergency_contact_2_instructions: string | null
          emergency_contact_2_name: string | null
          emergency_contact_2_phone: string | null
          emergency_contact_2_relationship: string | null
          emergency_contact_address: string | null
          emergency_contact_instructions: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          emergency_medical_treatment_authorization: boolean | null
          ethnic_origin: string | null
          eye_color: string | null
          feature_config: Json | null
          field_confirmations: Json
          first_name: string
          form_1056_approved_date: string | null
          form_1056_number: string | null
          geofence_radius_feet: number
          grievance_acknowledged: boolean | null
          grievance_signed_date: string | null
          guardian_address: string | null
          guardian_email: string | null
          guardian_name: string | null
          guardian_phone: string | null
          guardian_relationship: string | null
          hair_color: string | null
          has_abi: boolean
          height_inches: number | null
          hhs_monthly_support_hours: number | null
          home_latitude: number | null
          home_longitude: number | null
          hospice_status: string | null
          housing_voucher: string | null
          hr_applicable: boolean
          id: string
          identifying_marks: string | null
          immunizations: string[] | null
          income_sources: string[] | null
          intake_date: string | null
          intake_status: string
          is_own_guardian: boolean
          job_code: string[]
          last_name: string
          level_of_need: string | null
          mailing_address: string | null
          meal_actuals_assignee: string | null
          med_prescriber_name: string | null
          med_prescriber_phone: string | null
          medicaid_case_number: string | null
          medicaid_id: string | null
          medical_insurance: string | null
          medicare_number: string | null
          needs_shopping_help: boolean
          neurologist_name: string | null
          neurologist_phone: string | null
          organization_id: string
          palliative_care_status: string | null
          payment_sources: string[] | null
          pcp_name: string | null
          pcp_phone: string | null
          pcsp_expiration_date: string | null
          pcsp_goals: string[]
          pcsp_signed_date: string | null
          personal_belongings_inventory: string[] | null
          pertinent_health_notes: string | null
          phone_number: string | null
          physical_address: string | null
          physician_address: string | null
          place_of_birth: string | null
          places_frequented: string | null
          plan_year: string | null
          polst_status: string | null
          preferred_activities: string[] | null
          preferred_living: string | null
          prescriber_name: string | null
          prescriber_phone: string | null
          primary_care_name: string | null
          primary_care_phone: string | null
          private_insurance: string | null
          profile_photo_url: string | null
          psychiatrist_address: string | null
          psychiatrist_name: string | null
          psychiatrist_phone: string | null
          religion: string | null
          residential_provider: string | null
          rights_restrictions: string[] | null
          roommates: string[] | null
          self_admin_med_support: boolean
          special_directions: string | null
          specialist_name: string | null
          specialist_phone: string | null
          ssn_last4: string | null
          staff_ratio: string | null
          state_id_expires_on: string | null
          state_id_number: string | null
          support_coordinator_company: string | null
          support_coordinator_email: string | null
          support_coordinator_name: string | null
          support_coordinator_phone: string | null
          swallowing_alerts: string[]
          team_id: string | null
          weight_pounds: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "clients"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      delete_client_hard: { Args: { _client_id: string }; Returns: Json }
      discard_import_job_hard: { Args: { _job_id: string }; Returns: Json }
      effective_capabilities: {
        Args: { _org_id: string; _user_id: string }
        Returns: string[]
      }
      find_possible_duplicate_referral: {
        Args: {
          _age: number
          _first_name: string
          _organization_id: string
          _support_coordinator_id: string
        }
        Returns: {
          age: number
          category: string
          created_at: string
          first_name: string
          id: string
          support_coordinator_id: string
        }[]
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
          activated_at: string | null
          activated_by: string | null
          activation_state: string
          applies_to: string | null
          approval_state: string | null
          category: string | null
          confirmed_optional: boolean
          created_at: string
          description: string | null
          id: string
          jurisdiction: string | null
          metadata: Json
          obligation_category: string | null
          obligation_category_source: string | null
          organization_id: string
          origin: string
          original_description: string | null
          original_frozen_at: string | null
          original_source_citation: string | null
          original_title: string | null
          requirement_key: string
          review_status: string
          satisfied_by: string | null
          scope_level: string | null
          service_code: string | null
          service_codes_all: string[] | null
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
          activated_at: string | null
          activated_by: string | null
          activation_state: string
          applies_to: string | null
          approval_state: string | null
          category: string | null
          confirmed_optional: boolean
          created_at: string
          description: string | null
          id: string
          jurisdiction: string | null
          metadata: Json
          obligation_category: string | null
          obligation_category_source: string | null
          organization_id: string
          origin: string
          original_description: string | null
          original_frozen_at: string | null
          original_source_citation: string | null
          original_title: string | null
          requirement_key: string
          review_status: string
          satisfied_by: string | null
          scope_level: string | null
          service_code: string | null
          service_codes_all: string[] | null
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
      get_rate_as_of: {
        Args: { _as_of: string; _client_id: string; _service_code: string }
        Returns: {
          effective_end: string
          effective_start: string
          rate_per_unit: number
          rate_source: string
          rate_source_plan_number: string
          source_kind: string
          unit_type: string
        }[]
      }
      get_referral_pipeline_stats: {
        Args: { _organization_id: string }
        Returns: Json
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
      has_capability: {
        Args: { _cap: string; _org_id: string; _user_id: string }
        Returns: boolean
      }
      has_org_role: {
        Args: {
          _org: string
          _role: Database["public"]["Enums"]["app_role"]
          _user: string
        }
        Returns: boolean
      }
      has_permission: {
        Args: { _org_id: string; _perm: string; _user_id: string }
        Returns: boolean
      }
      hive_training_seat_available: {
        Args: { _seat_id: string }
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
      is_active_auditor: { Args: { _uid: string }; Returns: boolean }
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
      is_med_assist_current: {
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
      mcp_exec_read_sql: { Args: { query: string }; Returns: Json }
      nectar_bump_chunk_attempt: {
        Args: { p_index: number; p_job: string }
        Returns: number
      }
      nectar_bump_draft_attempt: { Args: { p_job: string }; Returns: undefined }
      nectar_bump_draft_transient: {
        Args: { p_job: string; p_msg: string }
        Returns: undefined
      }
      nectar_check_rate: {
        Args: {
          p_daily_token_cap: number
          p_key: string
          p_max_per_min: number
        }
        Returns: {
          day_full: boolean
          day_tokens_used: number
          wait_ms: number
        }[]
      }
      nectar_record_tokens: {
        Args: { p_key: string; p_tokens: number }
        Returns: undefined
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
      purge_aged_referrals: {
        Args: { _organization_id: string }
        Returns: number
      }
      rebuild_wipe_requirements_tns_fake:
        | { Args: never; Returns: number }
        | { Args: { p_keep_pending?: boolean }; Returns: number }
      restore_my_admin_role: { Args: never; Returns: undefined }
      seed_standard_service_codes: {
        Args: { _org: string }
        Returns: undefined
      }
      seed_system_rbac_roles: { Args: { _org: string }; Returns: undefined }
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
      agreement_status: "not_started" | "sent" | "signed" | "expired"
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
      doc_date_source: "from_document" | "provider_entered"
      doc_effective_to_mode: "fixed_date" | "ongoing" | "until_replaced"
      doc_status: "current" | "outdated"
      external_cert_status: "pending" | "approved" | "rejected" | "expired"
      functionality_report_source: "self_report" | "auto_detect"
      functionality_report_status: "open" | "triaged" | "resolved" | "dismissed"
      hhp_cue_card_source: "questionnaire" | "manual"
      hhp_cue_card_status: "onboarding" | "ready" | "placed"
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
      hive_training_assignment_status:
        | "pending_payment"
        | "not_started"
        | "in_progress"
        | "completed"
        | "expired"
      hive_training_auto_renew_scope: "all" | "full_program" | "selected"
      hive_training_auto_renew_status:
        | "succeeded"
        | "card_failed"
        | "no_eligible"
        | "partial"
        | "error"
      hive_training_catalog_kind: "full_program" | "ala_carte"
      hive_training_order_model: "bulk_seats" | "individual"
      hive_training_order_status: "pending" | "paid" | "refunded" | "failed"
      hive_training_seat_status: "available" | "assigned" | "consumed"
      home_position: "manager" | "supervisor" | "staff"
      invitation_status: "pending" | "accepted" | "revoked"
      other_assignment_proposer: "admin" | "manager" | "nectar"
      other_assignment_status: "not_started" | "in_progress" | "completed"
      other_assignment_type: "training" | "task" | "requirement"
      provider_training_kind: "policies" | "person"
      provider_training_status: "draft" | "published"
      report_cadence: "weekly" | "monthly"
      sub_plan: "starter" | "pro" | "enterprise" | "custom" | "hive_standard"
      sub_status:
        | "trial"
        | "active"
        | "past_due"
        | "canceled"
        | "paused"
        | "locked"
        | "cancelled"
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
      agreement_status: ["not_started", "sent", "signed", "expired"],
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
      doc_date_source: ["from_document", "provider_entered"],
      doc_effective_to_mode: ["fixed_date", "ongoing", "until_replaced"],
      doc_status: ["current", "outdated"],
      external_cert_status: ["pending", "approved", "rejected", "expired"],
      functionality_report_source: ["self_report", "auto_detect"],
      functionality_report_status: ["open", "triaged", "resolved", "dismissed"],
      hhp_cue_card_source: ["questionnaire", "manual"],
      hhp_cue_card_status: ["onboarding", "ready", "placed"],
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
      hive_training_assignment_status: [
        "pending_payment",
        "not_started",
        "in_progress",
        "completed",
        "expired",
      ],
      hive_training_auto_renew_scope: ["all", "full_program", "selected"],
      hive_training_auto_renew_status: [
        "succeeded",
        "card_failed",
        "no_eligible",
        "partial",
        "error",
      ],
      hive_training_catalog_kind: ["full_program", "ala_carte"],
      hive_training_order_model: ["bulk_seats", "individual"],
      hive_training_order_status: ["pending", "paid", "refunded", "failed"],
      hive_training_seat_status: ["available", "assigned", "consumed"],
      home_position: ["manager", "supervisor", "staff"],
      invitation_status: ["pending", "accepted", "revoked"],
      other_assignment_proposer: ["admin", "manager", "nectar"],
      other_assignment_status: ["not_started", "in_progress", "completed"],
      other_assignment_type: ["training", "task", "requirement"],
      provider_training_kind: ["policies", "person"],
      provider_training_status: ["draft", "published"],
      report_cadence: ["weekly", "monthly"],
      sub_plan: ["starter", "pro", "enterprise", "custom", "hive_standard"],
      sub_status: [
        "trial",
        "active",
        "past_due",
        "canceled",
        "paused",
        "locked",
        "cancelled",
      ],
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
