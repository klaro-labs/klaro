/**
 * Auto-generated Supabase Database types — DO NOT EDIT BY HAND.
 *
 * Generated via \ from the live
 * Klaro project schema (QA-055 follow-up to the QA-026/033/035/036/054
 * column-mismatch silent-fail family). To regenerate after a migration:
 *   pnpm --filter @klaro/web supabase:gen-types
 * (or via Supabase MCP).
 *
 * Apps that touch the DB should import this type into createClient<Database>(...)
 * so every column reference is compile-checked. The 5 column-mismatch bugs
 * fixed this session would have been compile errors with this in place.
 */

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
      admins: {
        Row: {
          created_at: string
          display_name: string
          email: string
          id: string
          role: Database["public"]["Enums"]["klaro_role"]
          supabase_user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          email: string
          id?: string
          role?: Database["public"]["Enums"]["klaro_role"]
          supabase_user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          role?: Database["public"]["Enums"]["klaro_role"]
          supabase_user_id?: string
        }
        Relationships: []
      }
      agent_jobs: {
        Row: {
          agent_id: string
          agent_wallet: string
          amount_usdc: number
          closed_at: string | null
          created_at: string
          deliverable_hash: string | null
          delivered_at: string | null
          fee_usdc: number
          funded_at: string | null
          id: string
          job_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["agent_job_status"]
          vendor_id: string
        }
        Insert: {
          agent_id: string
          agent_wallet: string
          amount_usdc: number
          closed_at?: string | null
          created_at?: string
          deliverable_hash?: string | null
          delivered_at?: string | null
          fee_usdc: number
          funded_at?: string | null
          id?: string
          job_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["agent_job_status"]
          vendor_id: string
        }
        Update: {
          agent_id?: string
          agent_wallet?: string
          amount_usdc?: number
          closed_at?: string | null
          created_at?: string
          deliverable_hash?: string | null
          delivered_at?: string | null
          fee_usdc?: number
          funded_at?: string | null
          id?: string
          job_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["agent_job_status"]
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_jobs_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_wallets: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          policy_caps: Json
          updated_at: string
          vendor_id: string
          wallet: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          policy_caps?: Json
          updated_at?: string
          vendor_id: string
          wallet: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          policy_caps?: Json
          updated_at?: string
          vendor_id?: string
          wallet?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_wallets_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string
          actor_kind: Database["public"]["Enums"]["klaro_actor_kind"]
          at: string
          evidence_hash: string | null
          id: string
          ip_hash: string | null
          note_md: string | null
          reason_hash: string | null
          runbook_id: string | null
          subject_id: string
          subject_kind: string
          ua_hash: string | null
        }
        Insert: {
          action: string
          actor_id: string
          actor_kind: Database["public"]["Enums"]["klaro_actor_kind"]
          at?: string
          evidence_hash?: string | null
          id?: string
          ip_hash?: string | null
          note_md?: string | null
          reason_hash?: string | null
          runbook_id?: string | null
          subject_id: string
          subject_kind: string
          ua_hash?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          actor_kind?: Database["public"]["Enums"]["klaro_actor_kind"]
          at?: string
          evidence_hash?: string | null
          id?: string
          ip_hash?: string | null
          note_md?: string | null
          reason_hash?: string | null
          runbook_id?: string | null
          subject_id?: string
          subject_kind?: string
          ua_hash?: string | null
        }
        Relationships: []
      }
      cashout_orders: {
        Row: {
          currency: string
          deleted_at: string | null
          id: string
          klaro_fee_usdc: number
          lp_id: string | null
          lp_name: string | null
          lp_spread_usdc: number
          payout_minor: number
          proof_hash: string | null
          quote_expires_at: string
          quote_hash: string
          quote_rate: number
          requested_at: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["cashout_status"]
          updated_at: string
          usdc_amount: number
          utr_reference: string | null
          vendor_id: string
          vendor_wallet: string
        }
        Insert: {
          currency: string
          deleted_at?: string | null
          id: string
          klaro_fee_usdc: number
          lp_id?: string | null
          lp_name?: string | null
          lp_spread_usdc: number
          payout_minor: number
          proof_hash?: string | null
          quote_expires_at: string
          quote_hash: string
          quote_rate: number
          requested_at?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["cashout_status"]
          updated_at?: string
          usdc_amount: number
          utr_reference?: string | null
          vendor_id: string
          vendor_wallet: string
        }
        Update: {
          currency?: string
          deleted_at?: string | null
          id?: string
          klaro_fee_usdc?: number
          lp_id?: string | null
          lp_name?: string | null
          lp_spread_usdc?: number
          payout_minor?: number
          proof_hash?: string | null
          quote_expires_at?: string
          quote_hash?: string
          quote_rate?: number
          requested_at?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["cashout_status"]
          updated_at?: string
          usdc_amount?: number
          utr_reference?: string | null
          vendor_id?: string
          vendor_wallet?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashout_orders_lp_id_fkey"
            columns: ["lp_id"]
            isOneToOne: false
            referencedRelation: "lp_profiles"
            referencedColumns: ["lp_id"]
          },
          {
            foreignKeyName: "cashout_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      cashout_quotes: {
        Row: {
          created_at: string
          currency: string
          expires_at: string
          id: string
          klaro_fee_usdc: number
          lp_spread_usdc: number
          payout_minor: number
          quote_hash: string
          quote_rate: number
          usdc_amount: number
          vendor_id: string
        }
        Insert: {
          created_at?: string
          currency: string
          expires_at: string
          id?: string
          klaro_fee_usdc: number
          lp_spread_usdc: number
          payout_minor: number
          quote_hash: string
          quote_rate: number
          usdc_amount: number
          vendor_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          expires_at?: string
          id?: string
          klaro_fee_usdc?: number
          lp_spread_usdc?: number
          payout_minor?: number
          quote_hash?: string
          quote_rate?: number
          usdc_amount?: number
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashout_quotes_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_submissions: {
        Row: {
          company: string | null
          created_at: string
          email: string
          id: string
          ip_hash: string | null
          message: string
          name: string
          source: string
          user_agent: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string
          email: string
          id?: string
          ip_hash?: string | null
          message: string
          name: string
          source?: string
          user_agent?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string
          id?: string
          ip_hash?: string | null
          message?: string
          name?: string
          source?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      counterparty_screen_cache: {
        Row: {
          bundle_hash: string
          buyer_address: string
          decided_at: string
          ttl_seconds: number
        }
        Insert: {
          bundle_hash: string
          buyer_address: string
          decided_at: string
          ttl_seconds?: number
        }
        Update: {
          bundle_hash?: string
          buyer_address?: string
          decided_at?: string
          ttl_seconds?: number
        }
        Relationships: []
      }
      customers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string | null
          vendor_id: string
          wallet_hint: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          vendor_id: string
          wallet_hint?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          vendor_id?: string
          wallet_hint?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      dead_letter_jobs: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          attempts_made: number
          failed_at: string
          failed_reason: string
          id: string
          job_id: string | null
          job_name: string | null
          payload: Json
          queue_name: string
          resolution_note: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          attempts_made: number
          failed_at?: string
          failed_reason: string
          id?: string
          job_id?: string | null
          job_name?: string | null
          payload: Json
          queue_name: string
          resolution_note?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          attempts_made?: number
          failed_at?: string
          failed_reason?: string
          id?: string
          job_id?: string | null
          job_name?: string | null
          payload?: Json
          queue_name?: string
          resolution_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dead_letter_jobs_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_evidence: {
        Row: {
          attachment_hash: string | null
          attachment_path: string | null
          body_md: string | null
          dispute_id: string
          id: string
          submitted_at: string
          submitter_id: string
          submitter_kind: Database["public"]["Enums"]["klaro_actor_kind"]
        }
        Insert: {
          attachment_hash?: string | null
          attachment_path?: string | null
          body_md?: string | null
          dispute_id: string
          id?: string
          submitted_at?: string
          submitter_id: string
          submitter_kind: Database["public"]["Enums"]["klaro_actor_kind"]
        }
        Update: {
          attachment_hash?: string | null
          attachment_path?: string | null
          body_md?: string | null
          dispute_id?: string
          id?: string
          submitted_at?: string
          submitter_id?: string
          submitter_kind?: Database["public"]["Enums"]["klaro_actor_kind"]
        }
        Relationships: [
          {
            foreignKeyName: "dispute_evidence_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          amount_usdc: number | null
          case_id: string
          claimant_id: string
          claimant_kind: Database["public"]["Enums"]["klaro_actor_kind"]
          decided_at: string | null
          decision_reason_hash: string | null
          deleted_at: string | null
          evidence_path: string | null
          id: string
          opened_at: string
          opening_evidence_hash: string | null
          outcome: Database["public"]["Enums"]["dispute_outcome"]
          respondent_id: string
          respondent_kind: Database["public"]["Enums"]["klaro_actor_kind"]
          source: string
          source_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount_usdc?: number | null
          case_id: string
          claimant_id: string
          claimant_kind: Database["public"]["Enums"]["klaro_actor_kind"]
          decided_at?: string | null
          decision_reason_hash?: string | null
          deleted_at?: string | null
          evidence_path?: string | null
          id?: string
          opened_at?: string
          opening_evidence_hash?: string | null
          outcome?: Database["public"]["Enums"]["dispute_outcome"]
          respondent_id: string
          respondent_kind: Database["public"]["Enums"]["klaro_actor_kind"]
          source: string
          source_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount_usdc?: number | null
          case_id?: string
          claimant_id?: string
          claimant_kind?: Database["public"]["Enums"]["klaro_actor_kind"]
          decided_at?: string | null
          decision_reason_hash?: string | null
          deleted_at?: string | null
          evidence_path?: string | null
          id?: string
          opened_at?: string
          opening_evidence_hash?: string | null
          outcome?: Database["public"]["Enums"]["dispute_outcome"]
          respondent_id?: string
          respondent_kind?: Database["public"]["Enums"]["klaro_actor_kind"]
          source?: string
          source_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      erp_connections: {
        Row: {
          auth_token_ciphertext: string | null
          config_json: Json
          created_at: string
          health_md: string | null
          id: string
          last_sync_at: string | null
          provider: string
          status: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          auth_token_ciphertext?: string | null
          config_json?: Json
          created_at?: string
          health_md?: string | null
          id?: string
          last_sync_at?: string | null
          provider: string
          status?: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          auth_token_ciphertext?: string | null
          config_json?: Json
          created_at?: string
          health_md?: string | null
          id?: string
          last_sync_at?: string | null
          provider?: string
          status?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_connections_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_sync_jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          enqueued_at: string
          id: string
          idempotency_key: string
          invoice_id: string | null
          kind: string
          last_error: string | null
          payload_json: Json
          provider: string
          status: string
          vendor_id: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          enqueued_at?: string
          id?: string
          idempotency_key: string
          invoice_id?: string | null
          kind: string
          last_error?: string | null
          payload_json: Json
          provider: string
          status?: string
          vendor_id: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          enqueued_at?: string
          id?: string
          idempotency_key?: string
          invoice_id?: string | null
          kind?: string
          last_error?: string | null
          payload_json?: Json
          provider?: string
          status?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_sync_jobs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_sync_jobs_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          amount_usdc: number
          description: string
          id: string
          invoice_id: string
          position: number
        }
        Insert: {
          amount_usdc: number
          description: string
          id?: string
          invoice_id: string
          position?: number
        }
        Update: {
          amount_usdc?: number
          description?: string
          id?: string
          invoice_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          acceptance_sig: string | null
          accepted_at: string | null
          accepted_by: string | null
          amount_usdc: number
          created_at: string
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          deleted_at: string | null
          due_at: string
          id: string
          metadata_hash: string
          notes_md: string | null
          paid_tx_hash: string | null
          privacy_mode: string
          receipt_hash: string | null
          requires_admin_review: boolean
          settled_tx_hash: string | null
          splits_hash: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          token: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          acceptance_sig?: string | null
          accepted_at?: string | null
          accepted_by?: string | null
          amount_usdc: number
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          deleted_at?: string | null
          due_at: string
          id: string
          metadata_hash: string
          notes_md?: string | null
          paid_tx_hash?: string | null
          privacy_mode?: string
          receipt_hash?: string | null
          requires_admin_review?: boolean
          settled_tx_hash?: string | null
          splits_hash?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          token: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          acceptance_sig?: string | null
          accepted_at?: string | null
          accepted_by?: string | null
          amount_usdc?: number
          created_at?: string
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          deleted_at?: string | null
          due_at?: string
          id?: string
          metadata_hash?: string
          notes_md?: string | null
          paid_tx_hash?: string | null
          privacy_mode?: string
          receipt_hash?: string | null
          requires_admin_review?: boolean
          settled_tx_hash?: string | null
          splits_hash?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          token?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_snapshots: {
        Row: {
          cashouts: number
          id: string
          invoices: number
          settled: number
          taken_at: string
          window_label: string
        }
        Insert: {
          cashouts?: number
          id?: string
          invoices?: number
          settled?: number
          taken_at?: string
          window_label: string
        }
        Update: {
          cashouts?: number
          id?: string
          invoices?: number
          settled?: number
          taken_at?: string
          window_label?: string
        }
        Relationships: []
      }
      lp_kyb: {
        Row: {
          bundle_hash: string
          documents_path: string | null
          lp_id: string
          outcome: string | null
          reason_hash: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          updated_at: string
        }
        Insert: {
          bundle_hash: string
          documents_path?: string | null
          lp_id: string
          outcome?: string | null
          reason_hash?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
        }
        Update: {
          bundle_hash?: string
          documents_path?: string | null
          lp_id?: string
          outcome?: string | null
          reason_hash?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lp_kyb_lp_id_fkey"
            columns: ["lp_id"]
            isOneToOne: true
            referencedRelation: "lp_profiles"
            referencedColumns: ["lp_id"]
          },
          {
            foreignKeyName: "lp_kyb_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["id"]
          },
        ]
      }
      lp_limits: {
        Row: {
          active_exposure_cap: number
          daily_max_usdc: number
          lp_id: string
          per_order_max_usdc: number
          updated_at: string
        }
        Insert: {
          active_exposure_cap?: number
          daily_max_usdc?: number
          lp_id: string
          per_order_max_usdc?: number
          updated_at?: string
        }
        Update: {
          active_exposure_cap?: number
          daily_max_usdc?: number
          lp_id?: string
          per_order_max_usdc?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lp_limits_lp_id_fkey"
            columns: ["lp_id"]
            isOneToOne: true
            referencedRelation: "lp_profiles"
            referencedColumns: ["lp_id"]
          },
        ]
      }
      lp_members: {
        Row: {
          created_at: string
          id: string
          lp_id: string
          role: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lp_id: string
          role: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lp_id?: string
          role?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lp_members_lp_id_fkey"
            columns: ["lp_id"]
            isOneToOne: false
            referencedRelation: "lp_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lp_members_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      lp_profiles: {
        Row: {
          active_exposure_usdc: number
          approved_at: string | null
          contact_email: string
          country: string | null
          deleted_at: string | null
          documents_path: string | null
          id: string
          invited_at: string
          kyb_record_hash: string | null
          last_reason_hash: string | null
          legal_entity_name: string | null
          lp_id: string
          payout_account_hash: string | null
          staked_usdc: number
          status: Database["public"]["Enums"]["lp_status"]
          supabase_user_id: string | null
          tier: number
          updated_at: string
          wallet: string | null
        }
        Insert: {
          active_exposure_usdc?: number
          approved_at?: string | null
          contact_email: string
          country?: string | null
          deleted_at?: string | null
          documents_path?: string | null
          id?: string
          invited_at?: string
          kyb_record_hash?: string | null
          last_reason_hash?: string | null
          legal_entity_name?: string | null
          lp_id: string
          payout_account_hash?: string | null
          staked_usdc?: number
          status?: Database["public"]["Enums"]["lp_status"]
          supabase_user_id?: string | null
          tier?: number
          updated_at?: string
          wallet?: string | null
        }
        Update: {
          active_exposure_usdc?: number
          approved_at?: string | null
          contact_email?: string
          country?: string | null
          deleted_at?: string | null
          documents_path?: string | null
          id?: string
          invited_at?: string
          kyb_record_hash?: string | null
          last_reason_hash?: string | null
          legal_entity_name?: string | null
          lp_id?: string
          payout_account_hash?: string | null
          staked_usdc?: number
          status?: Database["public"]["Enums"]["lp_status"]
          supabase_user_id?: string | null
          tier?: number
          updated_at?: string
          wallet?: string | null
        }
        Relationships: []
      }
      lp_reputation: {
        Row: {
          disputes_lost: number
          disputes_opened: number
          last_calc_at: string
          lp_id: string
          median_minutes: number | null
          orders_completed: number
          score: number
        }
        Insert: {
          disputes_lost?: number
          disputes_opened?: number
          last_calc_at?: string
          lp_id: string
          median_minutes?: number | null
          orders_completed?: number
          score?: number
        }
        Update: {
          disputes_lost?: number
          disputes_opened?: number
          last_calc_at?: string
          lp_id?: string
          median_minutes?: number | null
          orders_completed?: number
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "lp_reputation_lp_id_fkey"
            columns: ["lp_id"]
            isOneToOne: true
            referencedRelation: "lp_profiles"
            referencedColumns: ["lp_id"]
          },
        ]
      }
      lp_stakes: {
        Row: {
          amount_usdc: number
          id: string
          lp_id: string
          slash_reason: string | null
          slashed_amount: number
          staked_at: string
          unstake_after: string | null
        }
        Insert: {
          amount_usdc: number
          id?: string
          lp_id: string
          slash_reason?: string | null
          slashed_amount?: number
          staked_at?: string
          unstake_after?: string | null
        }
        Update: {
          amount_usdc?: number
          id?: string
          lp_id?: string
          slash_reason?: string | null
          slashed_amount?: number
          staked_at?: string
          unstake_after?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lp_stakes_lp_id_fkey"
            columns: ["lp_id"]
            isOneToOne: false
            referencedRelation: "lp_profiles"
            referencedColumns: ["lp_id"]
          },
        ]
      }
      payment_routes: {
        Row: {
          arc_tx_hash: string | null
          attestation_hash: string | null
          bridge_intent_id: string | null
          destination_chain: string | null
          id: string
          invoice_id: string
          route_kind: string
          settled_at: string | null
          source_chain: string | null
          source_tx_hash: string | null
          started_at: string
          state: string
          state_detail: string | null
        }
        Insert: {
          arc_tx_hash?: string | null
          attestation_hash?: string | null
          bridge_intent_id?: string | null
          destination_chain?: string | null
          id?: string
          invoice_id: string
          route_kind: string
          settled_at?: string | null
          source_chain?: string | null
          source_tx_hash?: string | null
          started_at?: string
          state?: string
          state_detail?: string | null
        }
        Update: {
          arc_tx_hash?: string | null
          attestation_hash?: string | null
          bridge_intent_id?: string | null
          destination_chain?: string | null
          id?: string
          invoice_id?: string
          route_kind?: string
          settled_at?: string | null
          source_chain?: string | null
          source_tx_hash?: string | null
          started_at?: string
          state?: string
          state_detail?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_routes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_proofs: {
        Row: {
          bank_method: string | null
          id: string
          order_id: string
          proof_hash: string
          screenshot_path: string | null
          simulated: boolean
          submitted_at: string
          utr_reference: string | null
          verified_at: string | null
        }
        Insert: {
          bank_method?: string | null
          id?: string
          order_id: string
          proof_hash: string
          screenshot_path?: string | null
          simulated?: boolean
          submitted_at?: string
          utr_reference?: string | null
          verified_at?: string | null
        }
        Update: {
          bank_method?: string | null
          id?: string
          order_id?: string
          proof_hash?: string
          screenshot_path?: string | null
          simulated?: boolean
          submitted_at?: string
          utr_reference?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payout_proofs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "cashout_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      protocol_limits: {
        Row: {
          category: string
          id: string
          label: string
          position: number
          unit: string
          updated_at: string
          value: string
          why: string
        }
        Insert: {
          category: string
          id?: string
          label: string
          position?: number
          unit: string
          updated_at?: string
          value: string
          why: string
        }
        Update: {
          category?: string
          id?: string
          label?: string
          position?: number
          unit?: string
          updated_at?: string
          value?: string
          why?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_agent_hash: string | null
          vendor_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent_hash?: string | null
          vendor_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent_hash?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          acceptance_hash: string | null
          created_at: string
          id: string
          invoice_hash: string
          invoice_id: string
          pdf_storage_path: string | null
          receipt_hash: string
          reveal_amount: boolean
          reveal_customer: boolean
          screening_hash: string | null
          settled_at: string
          settlement_tx: string
          source_chain_id: number | null
        }
        Insert: {
          acceptance_hash?: string | null
          created_at?: string
          id?: string
          invoice_hash: string
          invoice_id: string
          pdf_storage_path?: string | null
          receipt_hash: string
          reveal_amount?: boolean
          reveal_customer?: boolean
          screening_hash?: string | null
          settled_at: string
          settlement_tx: string
          source_chain_id?: number | null
        }
        Update: {
          acceptance_hash?: string | null
          created_at?: string
          id?: string
          invoice_hash?: string
          invoice_id?: string
          pdf_storage_path?: string | null
          receipt_hash?: string
          reveal_amount?: boolean
          reveal_customer?: boolean
          screening_hash?: string | null
          settled_at?: string
          settlement_tx?: string
          source_chain_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "receipts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      sanctions_refresh_runs: {
        Row: {
          detail: Json | null
          finished_at: string | null
          id: string
          ran_at: string
          reason: string | null
          source: string
          status: string
        }
        Insert: {
          detail?: Json | null
          finished_at?: string | null
          id?: string
          ran_at?: string
          reason?: string | null
          source: string
          status: string
        }
        Update: {
          detail?: Json | null
          finished_at?: string | null
          id?: string
          ran_at?: string
          reason?: string | null
          source?: string
          status?: string
        }
        Relationships: []
      }
      screening_results: {
        Row: {
          buyer_address: string
          detail_md: string | null
          evidence_hash: string
          id: string
          invoice_id: string
          provider: string
          ran_at: string
          result: string
        }
        Insert: {
          buyer_address: string
          detail_md?: string | null
          evidence_hash: string
          id?: string
          invoice_id: string
          provider: string
          ran_at?: string
          result: string
        }
        Update: {
          buyer_address?: string
          detail_md?: string | null
          evidence_hash?: string
          id?: string
          invoice_id?: string
          provider?: string
          ran_at?: string
          result?: string
        }
        Relationships: [
          {
            foreignKeyName: "screening_results_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_kyb: {
        Row: {
          documents_path: string | null
          kyb_record_hash: string | null
          reason_hash: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          tier: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
          documents_path?: string | null
          kyb_record_hash?: string | null
          reason_hash?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tier?: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
          documents_path?: string | null
          kyb_record_hash?: string | null
          reason_hash?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tier?: number
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_kyb_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_kyb_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: true
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_limits: {
        Row: {
          max_cashout_usdc_daily: number
          max_cashout_usdc_total: number
          max_invoice_usdc: number
          updated_at: string
          vendor_id: string
        }
        Insert: {
          max_cashout_usdc_daily?: number
          max_cashout_usdc_total?: number
          max_invoice_usdc?: number
          updated_at?: string
          vendor_id: string
        }
        Update: {
          max_cashout_usdc_daily?: number
          max_cashout_usdc_total?: number
          max_invoice_usdc?: number
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_limits_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: true
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_team_members: {
        Row: {
          accepted_at: string | null
          email: string
          id: string
          invited_at: string
          removed_at: string | null
          role: Database["public"]["Enums"]["klaro_role"]
          supabase_user_id: string
          vendor_id: string
        }
        Insert: {
          accepted_at?: string | null
          email: string
          id?: string
          invited_at?: string
          removed_at?: string | null
          role?: Database["public"]["Enums"]["klaro_role"]
          supabase_user_id: string
          vendor_id: string
        }
        Update: {
          accepted_at?: string | null
          email?: string
          id?: string
          invited_at?: string
          removed_at?: string | null
          role?: Database["public"]["Enums"]["klaro_role"]
          supabase_user_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_team_members_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          brand_color: string | null
          brand_logo_url: string | null
          circle_wallet_id: string | null
          country: string | null
          created_at: string
          display_name: string
          email: string
          id: string
          invoice_template_version: number
          supabase_user_id: string | null
          updated_at: string
          wallet: string | null
          wallet_provisioned_at: string | null
        }
        Insert: {
          brand_color?: string | null
          brand_logo_url?: string | null
          circle_wallet_id?: string | null
          country?: string | null
          created_at?: string
          display_name: string
          email: string
          id?: string
          invoice_template_version?: number
          supabase_user_id?: string | null
          updated_at?: string
          wallet?: string | null
          wallet_provisioned_at?: string | null
        }
        Update: {
          brand_color?: string | null
          brand_logo_url?: string | null
          circle_wallet_id?: string | null
          country?: string | null
          created_at?: string
          display_name?: string
          email?: string
          id?: string
          invoice_template_version?: number
          supabase_user_id?: string | null
          updated_at?: string
          wallet?: string | null
          wallet_provisioned_at?: string | null
        }
        Relationships: []
      }
      webauthn_challenges: {
        Row: {
          challenge: string
          expires_at: string
          kind: string
          vendor_id: string | null
        }
        Insert: {
          challenge: string
          expires_at?: string
          kind: string
          vendor_id?: string | null
        }
        Update: {
          challenge?: string
          expires_at?: string
          kind?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webauthn_challenges_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      webauthn_credentials: {
        Row: {
          counter: number
          created_at: string
          credential_id: string
          device_label: string | null
          id: string
          last_used_at: string | null
          public_key: string
          transports: string[] | null
          vendor_id: string
        }
        Insert: {
          counter?: number
          created_at?: string
          credential_id: string
          device_label?: string | null
          id?: string
          last_used_at?: string | null
          public_key: string
          transports?: string[] | null
          vendor_id: string
        }
        Update: {
          counter?: number
          created_at?: string
          credential_id?: string
          device_label?: string | null
          id?: string
          last_used_at?: string | null
          public_key?: string
          transports?: string[] | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webauthn_credentials_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          attempts: number
          delivered_at: string | null
          event: string
          id: string
          idempotency_key: string
          last_attempt_at: string | null
          last_error: string | null
          payload_json: Json
          status: string
          webhook_id: string
        }
        Insert: {
          attempts?: number
          delivered_at?: string | null
          event: string
          id?: string
          idempotency_key: string
          last_attempt_at?: string | null
          last_error?: string | null
          payload_json: Json
          status?: string
          webhook_id: string
        }
        Update: {
          attempts?: number
          delivered_at?: string | null
          event?: string
          id?: string
          idempotency_key?: string
          last_attempt_at?: string | null
          last_error?: string | null
          payload_json?: Json
          status?: string
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          created_at: string
          events: string[]
          id: string
          secret_ciphertext: string
          status: string
          updated_at: string
          url: string
          vendor_id: string
        }
        Insert: {
          created_at?: string
          events: string[]
          id?: string
          secret_ciphertext: string
          status?: string
          updated_at?: string
          url: string
          vendor_id: string
        }
        Update: {
          created_at?: string
          events?: string[]
          id?: string
          secret_ciphertext?: string
          status?: string
          updated_at?: string
          url?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhooks_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_vendor_id: { Args: never; Returns: string }
      get_public_invoice: {
        Args: { p_id: string }
        Returns: {
          amount_usdc: number
          created_at: string
          customer_email: string
          customer_name: string
          due_at: string
          id: string
          line_items: Json
          metadata_hash: string
          notes_md: string
          privacy_mode: string
          splits_hash: string
          status: string
          token: string
          updated_at: string
          vendor_display_name: string
          vendor_id: string
          vendor_wallet: string
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_lp_owner: { Args: { lp_uuid: string }; Returns: boolean }
    }
    Enums: {
      agent_job_status:
        | "CREATED"
        | "FUNDED"
        | "STARTED"
        | "DELIVERED"
        | "CLOSED"
        | "DISPUTED"
        | "CANCELLED"
      cashout_status:
        | "REQUESTED"
        | "LOCKED"
        | "CLAIMED"
        | "PROOF_SUBMITTED"
        | "CONFIRMED"
        | "RELEASED"
        | "DISPUTED"
        | "RESOLVED_LP_PAYS"
        | "RESOLVED_VENDOR_PAYS"
        | "EXPIRED"
        | "CANCELLED"
      dispute_outcome:
        | "PENDING"
        | "RELEASE_TO_CLAIMANT"
        | "REFUND_TO_RESPONDENT"
        | "ASK_MORE_EVIDENCE"
        | "SLASH_LP"
        | "PENALIZE_VENDOR"
        | "CANCELLED"
      invoice_status:
        | "CREATED"
        | "ACCEPTED"
        | "PAID"
        | "SETTLED"
        | "REFUNDED"
        | "CANCELLED"
      klaro_actor_kind: "vendor" | "admin" | "lp" | "system" | "daemon"
      klaro_role: "owner" | "admin" | "member" | "readonly"
      lp_status:
        | "INVITED"
        | "APPLIED"
        | "UNDER_REVIEW"
        | "APPROVED"
        | "STAKED"
        | "SUSPENDED"
        | "REVOKED"
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
      agent_job_status: [
        "CREATED",
        "FUNDED",
        "STARTED",
        "DELIVERED",
        "CLOSED",
        "DISPUTED",
        "CANCELLED",
      ],
      cashout_status: [
        "REQUESTED",
        "LOCKED",
        "CLAIMED",
        "PROOF_SUBMITTED",
        "CONFIRMED",
        "RELEASED",
        "DISPUTED",
        "RESOLVED_LP_PAYS",
        "RESOLVED_VENDOR_PAYS",
        "EXPIRED",
        "CANCELLED",
      ],
      dispute_outcome: [
        "PENDING",
        "RELEASE_TO_CLAIMANT",
        "REFUND_TO_RESPONDENT",
        "ASK_MORE_EVIDENCE",
        "SLASH_LP",
        "PENALIZE_VENDOR",
        "CANCELLED",
      ],
      invoice_status: [
        "CREATED",
        "ACCEPTED",
        "PAID",
        "SETTLED",
        "REFUNDED",
        "CANCELLED",
      ],
      klaro_actor_kind: ["vendor", "admin", "lp", "system", "daemon"],
      klaro_role: ["owner", "admin", "member", "readonly"],
      lp_status: [
        "INVITED",
        "APPLIED",
        "UNDER_REVIEW",
        "APPROVED",
        "STAKED",
        "SUSPENDED",
        "REVOKED",
      ],
    },
  },
} as const
