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
      aprovadores: {
        Row: {
          ativo: boolean
          bu: string
          coordenador: string
          created_at: string
          diretor: string
          gerente: string
          id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          bu: string
          coordenador: string
          created_at?: string
          diretor: string
          gerente: string
          id?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          bu?: string
          coordenador?: string
          created_at?: string
          diretor?: string
          gerente?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      configuracoes: {
        Row: {
          chave: string
          updated_at: string
          valor: string
        }
        Insert: {
          chave: string
          updated_at?: string
          valor: string
        }
        Update: {
          chave?: string
          updated_at?: string
          valor?: string
        }
        Relationships: []
      }
      consumo_materiais: {
        Row: {
          created_at: string
          equipamento_id: string | null
          id: string
          material: string
          observacao: string | null
          os_numero: string | null
          quantidade: number
          reserva_numero: string | null
          solicitante_id: string
          status: string
          tratado_at: string | null
          tratado_por: string | null
          unidade: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          equipamento_id?: string | null
          id?: string
          material: string
          observacao?: string | null
          os_numero?: string | null
          quantidade?: number
          reserva_numero?: string | null
          solicitante_id: string
          status?: string
          tratado_at?: string | null
          tratado_por?: string | null
          unidade?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          equipamento_id?: string | null
          id?: string
          material?: string
          observacao?: string | null
          os_numero?: string | null
          quantidade?: number
          reserva_numero?: string | null
          solicitante_id?: string
          status?: string
          tratado_at?: string | null
          tratado_por?: string | null
          unidade?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "consumo_materiais_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "equipamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumo_materiais_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "equipamentos_publicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumo_materiais_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "solicitantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumo_materiais_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "solicitantes_publicos"
            referencedColumns: ["id"]
          },
        ]
      }
      envios_pedido: {
        Row: {
          anexos: Json
          assunto: string | null
          cc: string[]
          corpo: string | null
          created_at: string
          enviado_por: string | null
          erro: string | null
          fornecedor_id: string | null
          fornecedor_nome: string | null
          id: string
          numero_pedido_compra: string | null
          para: string[]
          pedido_compra_id: string | null
          status: string
        }
        Insert: {
          anexos?: Json
          assunto?: string | null
          cc?: string[]
          corpo?: string | null
          created_at?: string
          enviado_por?: string | null
          erro?: string | null
          fornecedor_id?: string | null
          fornecedor_nome?: string | null
          id?: string
          numero_pedido_compra?: string | null
          para?: string[]
          pedido_compra_id?: string | null
          status?: string
        }
        Update: {
          anexos?: Json
          assunto?: string | null
          cc?: string[]
          corpo?: string | null
          created_at?: string
          enviado_por?: string | null
          erro?: string | null
          fornecedor_id?: string | null
          fornecedor_nome?: string | null
          id?: string
          numero_pedido_compra?: string | null
          para?: string[]
          pedido_compra_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "envios_pedido_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envios_pedido_pedido_compra_id_fkey"
            columns: ["pedido_compra_id"]
            isOneToOne: false
            referencedRelation: "pedidos_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "envios_pedido_pedido_compra_id_fkey"
            columns: ["pedido_compra_id"]
            isOneToOne: false
            referencedRelation: "pedidos_publicos"
            referencedColumns: ["id"]
          },
        ]
      }
      equipamentos: {
        Row: {
          ativo: boolean
          codigo_armac: string | null
          created_at: string
          descricao: string | null
          id: string
          modelo: string | null
          numero_serie: string | null
          prefixo_interno: string
        }
        Insert: {
          ativo?: boolean
          codigo_armac?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          modelo?: string | null
          numero_serie?: string | null
          prefixo_interno: string
        }
        Update: {
          ativo?: boolean
          codigo_armac?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          modelo?: string | null
          numero_serie?: string | null
          prefixo_interno?: string
        }
        Relationships: []
      }
      fornecedores: {
        Row: {
          ativo: boolean
          created_at: string
          emails_cc: string[]
          emails_to: string[]
          id: string
          nome: string
          observacao: string | null
          portal: boolean
          portal_url: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          emails_cc?: string[]
          emails_to?: string[]
          id?: string
          nome: string
          observacao?: string | null
          portal?: boolean
          portal_url?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          emails_cc?: string[]
          emails_to?: string[]
          id?: string
          nome?: string
          observacao?: string | null
          portal?: boolean
          portal_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      materiais_almox: {
        Row: {
          codigo_sap: string
          created_at: string
          descricao: string | null
          descricao_antiga: string | null
          desenho_engeman: string | null
          id: string
          locacao: string | null
          novo_cod: string | null
          qtd: number
          referencia_fabrica: string | null
          updated_at: string
        }
        Insert: {
          codigo_sap: string
          created_at?: string
          descricao?: string | null
          descricao_antiga?: string | null
          desenho_engeman?: string | null
          id?: string
          locacao?: string | null
          novo_cod?: string | null
          qtd?: number
          referencia_fabrica?: string | null
          updated_at?: string
        }
        Update: {
          codigo_sap?: string
          created_at?: string
          descricao?: string | null
          descricao_antiga?: string | null
          desenho_engeman?: string | null
          id?: string
          locacao?: string | null
          novo_cod?: string | null
          qtd?: number
          referencia_fabrica?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      materiais_sem_giro: {
        Row: {
          created_at: string
          descricao: string | null
          desenho: string | null
          id: string
          lote: string | null
          qtd: number
          referencia: string
          tipo_produto: string | null
          updated_at: string
          valor_unit: number | null
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          desenho?: string | null
          id?: string
          lote?: string | null
          qtd?: number
          referencia: string
          tipo_produto?: string | null
          updated_at?: string
          valor_unit?: number | null
        }
        Update: {
          created_at?: string
          descricao?: string | null
          desenho?: string | null
          id?: string
          lote?: string | null
          qtd?: number
          referencia?: string
          tipo_produto?: string | null
          updated_at?: string
          valor_unit?: number | null
        }
        Relationships: []
      }
      notificacoes: {
        Row: {
          created_at: string
          destinatario_role: Database["public"]["Enums"]["app_role"] | null
          destinatario_solicitante_id: string | null
          destinatario_user_id: string | null
          id: string
          lida: boolean
          mensagem: string
          solicitacao_id: string | null
          titulo: string
        }
        Insert: {
          created_at?: string
          destinatario_role?: Database["public"]["Enums"]["app_role"] | null
          destinatario_solicitante_id?: string | null
          destinatario_user_id?: string | null
          id?: string
          lida?: boolean
          mensagem: string
          solicitacao_id?: string | null
          titulo: string
        }
        Update: {
          created_at?: string
          destinatario_role?: Database["public"]["Enums"]["app_role"] | null
          destinatario_solicitante_id?: string | null
          destinatario_user_id?: string | null
          id?: string
          lida?: boolean
          mensagem?: string
          solicitacao_id?: string | null
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_destinatario_solicitante_id_fkey"
            columns: ["destinatario_solicitante_id"]
            isOneToOne: false
            referencedRelation: "solicitantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_destinatario_solicitante_id_fkey"
            columns: ["destinatario_solicitante_id"]
            isOneToOne: false
            referencedRelation: "solicitantes_publicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solicitacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notificacoes_solicitacao_id_fkey"
            columns: ["solicitacao_id"]
            isOneToOne: false
            referencedRelation: "solicitacoes_publicas"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_compra: {
        Row: {
          bu: string | null
          codigo_rastreio: string | null
          comprador_at: string | null
          coordenador: string | null
          created_at: string
          diretor: string | null
          fornecedor: string | null
          gerente: string | null
          id: string
          link_rastreio: string | null
          numero_pedido_compra: string | null
          prazo_dias_entrega: number | null
          prazo_entrega: string | null
          tipo_frete: Database["public"]["Enums"]["tipo_frete"] | null
          transportadora: string | null
          updated_at: string
          valor_total: number
        }
        Insert: {
          bu?: string | null
          codigo_rastreio?: string | null
          comprador_at?: string | null
          coordenador?: string | null
          created_at?: string
          diretor?: string | null
          fornecedor?: string | null
          gerente?: string | null
          id?: string
          link_rastreio?: string | null
          numero_pedido_compra?: string | null
          prazo_dias_entrega?: number | null
          prazo_entrega?: string | null
          tipo_frete?: Database["public"]["Enums"]["tipo_frete"] | null
          transportadora?: string | null
          updated_at?: string
          valor_total: number
        }
        Update: {
          bu?: string | null
          codigo_rastreio?: string | null
          comprador_at?: string | null
          coordenador?: string | null
          created_at?: string
          diretor?: string | null
          fornecedor?: string | null
          gerente?: string | null
          id?: string
          link_rastreio?: string | null
          numero_pedido_compra?: string | null
          prazo_dias_entrega?: number | null
          prazo_entrega?: string | null
          tipo_frete?: Database["public"]["Enums"]["tipo_frete"] | null
          transportadora?: string | null
          updated_at?: string
          valor_total?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          must_change_password: boolean
          nome: string
          telefone_whatsapp: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          must_change_password?: boolean
          nome: string
          telefone_whatsapp?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          must_change_password?: boolean
          nome?: string
          telefone_whatsapp?: string | null
        }
        Relationships: []
      }
      saidas_sem_giro: {
        Row: {
          baixado_por: string | null
          created_at: string
          descricao: string | null
          id: string
          lote: string | null
          material_id: string | null
          observacao: string | null
          os_numero: string | null
          quantidade: number
          referencia: string
          solicitante: string | null
        }
        Insert: {
          baixado_por?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          lote?: string | null
          material_id?: string | null
          observacao?: string | null
          os_numero?: string | null
          quantidade: number
          referencia: string
          solicitante?: string | null
        }
        Update: {
          baixado_por?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          lote?: string | null
          material_id?: string | null
          observacao?: string | null
          os_numero?: string | null
          quantidade?: number
          referencia?: string
          solicitante?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saidas_sem_giro_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materiais_sem_giro"
            referencedColumns: ["id"]
          },
        ]
      }
      sap_carga: {
        Row: {
          coordenador: string | null
          created_at: string
          data_pedido: string | null
          diretor: string | null
          fornecedor: string | null
          gerente: string | null
          id: string
          numero_pedido: string | null
          ref_id: string | null
          status: string | null
          tipo: string
          valor: number | null
        }
        Insert: {
          coordenador?: string | null
          created_at?: string
          data_pedido?: string | null
          diretor?: string | null
          fornecedor?: string | null
          gerente?: string | null
          id?: string
          numero_pedido?: string | null
          ref_id?: string | null
          status?: string | null
          tipo: string
          valor?: number | null
        }
        Update: {
          coordenador?: string | null
          created_at?: string
          data_pedido?: string | null
          diretor?: string | null
          fornecedor?: string | null
          gerente?: string | null
          id?: string
          numero_pedido?: string | null
          ref_id?: string | null
          status?: string | null
          tipo?: string
          valor?: number | null
        }
        Relationships: []
      }
      solicitacoes: {
        Row: {
          aprovador_gestao_at: string | null
          aprovador_gestao_id: string | null
          codigo_peca: string | null
          codigo_peca_normalizado: string | null
          codigo_rastreio: string | null
          comprador_at: string | null
          comprador_id: string | null
          created_at: string
          data_entrega_mecanico: string | null
          data_recebimento_almox: string | null
          descricao: string
          duplicidade_detectada: boolean
          em_cadastro: boolean
          equipamento_id: string
          equipamento_uso_id: string | null
          fornecedor: string | null
          foto_peca_path: string | null
          id: string
          justificativa_duplicidade: string | null
          liberacao_diretoria: boolean
          liberacao_diretoria_at: string | null
          link_rastreio: string | null
          motivo_reprovacao_gestao: string | null
          motivo_reprovacao_supervisor: string | null
          numero_pedido_compra: string | null
          observacao_recebimento: string | null
          observacao_retirada: string | null
          observacoes_gerais: string | null
          observacoes_pcm: string | null
          orcamento_path: string | null
          os_numero: string
          pcm_at: string | null
          pcm_id: string | null
          pcm_motivo_pendencia: string | null
          pedido_compra_id: string | null
          pedido_compra_path: string | null
          pedido_retirada: boolean
          pode_ser_paralela: boolean
          prazo_entrega: string | null
          quantidade: number
          rc_numero: string | null
          recebido_almox_por: string | null
          reserva_numero: string | null
          sap_conferido_at: string | null
          solicitante_id: string
          status: Database["public"]["Enums"]["solicitacao_status"]
          supervisor_at: string | null
          supervisor_id: string | null
          tipo_frete: Database["public"]["Enums"]["tipo_frete"] | null
          transportadora: string | null
          tratativa_at: string | null
          tratativa_por: string | null
          tratativa_por_nome: string | null
          unidade: string | null
          updated_at: string
          urgencia: string
          vai_para_outro: boolean
          valor_item: number | null
          valor_total: number | null
        }
        Insert: {
          aprovador_gestao_at?: string | null
          aprovador_gestao_id?: string | null
          codigo_peca?: string | null
          codigo_peca_normalizado?: string | null
          codigo_rastreio?: string | null
          comprador_at?: string | null
          comprador_id?: string | null
          created_at?: string
          data_entrega_mecanico?: string | null
          data_recebimento_almox?: string | null
          descricao: string
          duplicidade_detectada?: boolean
          em_cadastro?: boolean
          equipamento_id: string
          equipamento_uso_id?: string | null
          fornecedor?: string | null
          foto_peca_path?: string | null
          id?: string
          justificativa_duplicidade?: string | null
          liberacao_diretoria?: boolean
          liberacao_diretoria_at?: string | null
          link_rastreio?: string | null
          motivo_reprovacao_gestao?: string | null
          motivo_reprovacao_supervisor?: string | null
          numero_pedido_compra?: string | null
          observacao_recebimento?: string | null
          observacao_retirada?: string | null
          observacoes_gerais?: string | null
          observacoes_pcm?: string | null
          orcamento_path?: string | null
          os_numero: string
          pcm_at?: string | null
          pcm_id?: string | null
          pcm_motivo_pendencia?: string | null
          pedido_compra_id?: string | null
          pedido_compra_path?: string | null
          pedido_retirada?: boolean
          pode_ser_paralela?: boolean
          prazo_entrega?: string | null
          quantidade?: number
          rc_numero?: string | null
          recebido_almox_por?: string | null
          reserva_numero?: string | null
          sap_conferido_at?: string | null
          solicitante_id: string
          status?: Database["public"]["Enums"]["solicitacao_status"]
          supervisor_at?: string | null
          supervisor_id?: string | null
          tipo_frete?: Database["public"]["Enums"]["tipo_frete"] | null
          transportadora?: string | null
          tratativa_at?: string | null
          tratativa_por?: string | null
          tratativa_por_nome?: string | null
          unidade?: string | null
          updated_at?: string
          urgencia?: string
          vai_para_outro?: boolean
          valor_item?: number | null
          valor_total?: number | null
        }
        Update: {
          aprovador_gestao_at?: string | null
          aprovador_gestao_id?: string | null
          codigo_peca?: string | null
          codigo_peca_normalizado?: string | null
          codigo_rastreio?: string | null
          comprador_at?: string | null
          comprador_id?: string | null
          created_at?: string
          data_entrega_mecanico?: string | null
          data_recebimento_almox?: string | null
          descricao?: string
          duplicidade_detectada?: boolean
          em_cadastro?: boolean
          equipamento_id?: string
          equipamento_uso_id?: string | null
          fornecedor?: string | null
          foto_peca_path?: string | null
          id?: string
          justificativa_duplicidade?: string | null
          liberacao_diretoria?: boolean
          liberacao_diretoria_at?: string | null
          link_rastreio?: string | null
          motivo_reprovacao_gestao?: string | null
          motivo_reprovacao_supervisor?: string | null
          numero_pedido_compra?: string | null
          observacao_recebimento?: string | null
          observacao_retirada?: string | null
          observacoes_gerais?: string | null
          observacoes_pcm?: string | null
          orcamento_path?: string | null
          os_numero?: string
          pcm_at?: string | null
          pcm_id?: string | null
          pcm_motivo_pendencia?: string | null
          pedido_compra_id?: string | null
          pedido_compra_path?: string | null
          pedido_retirada?: boolean
          pode_ser_paralela?: boolean
          prazo_entrega?: string | null
          quantidade?: number
          rc_numero?: string | null
          recebido_almox_por?: string | null
          reserva_numero?: string | null
          sap_conferido_at?: string | null
          solicitante_id?: string
          status?: Database["public"]["Enums"]["solicitacao_status"]
          supervisor_at?: string | null
          supervisor_id?: string | null
          tipo_frete?: Database["public"]["Enums"]["tipo_frete"] | null
          transportadora?: string | null
          tratativa_at?: string | null
          tratativa_por?: string | null
          tratativa_por_nome?: string | null
          unidade?: string | null
          updated_at?: string
          urgencia?: string
          vai_para_outro?: boolean
          valor_item?: number | null
          valor_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "equipamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "equipamentos_publicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_equipamento_uso_id_fkey"
            columns: ["equipamento_uso_id"]
            isOneToOne: false
            referencedRelation: "equipamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_equipamento_uso_id_fkey"
            columns: ["equipamento_uso_id"]
            isOneToOne: false
            referencedRelation: "equipamentos_publicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_pedido_compra_id_fkey"
            columns: ["pedido_compra_id"]
            isOneToOne: false
            referencedRelation: "pedidos_compra"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_pedido_compra_id_fkey"
            columns: ["pedido_compra_id"]
            isOneToOne: false
            referencedRelation: "pedidos_publicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "solicitantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "solicitantes_publicos"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitantes: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      consumo_publicos: {
        Row: {
          created_at: string | null
          equipamento_id: string | null
          id: string | null
          material: string | null
          observacao: string | null
          os_numero: string | null
          quantidade: number | null
          reserva_numero: string | null
          solicitante_id: string | null
          status: string | null
          unidade: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          equipamento_id?: string | null
          id?: string | null
          material?: string | null
          observacao?: string | null
          os_numero?: string | null
          quantidade?: number | null
          reserva_numero?: string | null
          solicitante_id?: string | null
          status?: string | null
          unidade?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          equipamento_id?: string | null
          id?: string | null
          material?: string | null
          observacao?: string | null
          os_numero?: string | null
          quantidade?: number | null
          reserva_numero?: string | null
          solicitante_id?: string | null
          status?: string | null
          unidade?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consumo_materiais_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "equipamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumo_materiais_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "equipamentos_publicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumo_materiais_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "solicitantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumo_materiais_solicitante_id_fkey"
            columns: ["solicitante_id"]
            isOneToOne: false
            referencedRelation: "solicitantes_publicos"
            referencedColumns: ["id"]
          },
        ]
      }
      equipamentos_publicos: {
        Row: {
          codigo_armac: string | null
          descricao: string | null
          id: string | null
          modelo: string | null
          numero_serie: string | null
          prefixo_interno: string | null
        }
        Insert: {
          codigo_armac?: string | null
          descricao?: string | null
          id?: string | null
          modelo?: string | null
          numero_serie?: string | null
          prefixo_interno?: string | null
        }
        Update: {
          codigo_armac?: string | null
          descricao?: string | null
          id?: string | null
          modelo?: string | null
          numero_serie?: string | null
          prefixo_interno?: string | null
        }
        Relationships: []
      }
      pedidos_publicos: {
        Row: {
          codigo_rastreio: string | null
          comprador_at: string | null
          created_at: string | null
          id: string | null
          link_rastreio: string | null
          numero_pedido_compra: string | null
          prazo_dias_entrega: number | null
          prazo_entrega: string | null
          tipo_frete: Database["public"]["Enums"]["tipo_frete"] | null
          transportadora: string | null
          updated_at: string | null
        }
        Insert: {
          codigo_rastreio?: string | null
          comprador_at?: string | null
          created_at?: string | null
          id?: string | null
          link_rastreio?: string | null
          numero_pedido_compra?: string | null
          prazo_dias_entrega?: number | null
          prazo_entrega?: string | null
          tipo_frete?: Database["public"]["Enums"]["tipo_frete"] | null
          transportadora?: string | null
          updated_at?: string | null
        }
        Update: {
          codigo_rastreio?: string | null
          comprador_at?: string | null
          created_at?: string | null
          id?: string | null
          link_rastreio?: string | null
          numero_pedido_compra?: string | null
          prazo_dias_entrega?: number | null
          prazo_entrega?: string | null
          tipo_frete?: Database["public"]["Enums"]["tipo_frete"] | null
          transportadora?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      solicitacoes_publicas: {
        Row: {
          aprovador_gestao_at: string | null
          codigo_armac: string | null
          codigo_peca: string | null
          comprador_at: string | null
          created_at: string | null
          data_entrega_mecanico: string | null
          data_recebimento_almox: string | null
          descricao: string | null
          equipamento_id: string | null
          id: string | null
          modelo: string | null
          numero_pedido_compra: string | null
          numero_serie: string | null
          os_numero: string | null
          pcm_at: string | null
          prazo_entrega: string | null
          prefixo_interno: string | null
          quantidade: number | null
          rc_numero: string | null
          reserva_numero: string | null
          solicitante_nome: string | null
          status: Database["public"]["Enums"]["solicitacao_status"] | null
          supervisor_at: string | null
          unidade: string | null
          urgencia: string | null
        }
        Relationships: [
          {
            foreignKeyName: "solicitacoes_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "equipamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "solicitacoes_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "equipamentos_publicos"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitantes_publicos: {
        Row: {
          id: string | null
          nome: string | null
        }
        Insert: {
          id?: string | null
          nome?: string | null
        }
        Update: {
          id?: string | null
          nome?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_any_manager: { Args: { _user_id: string }; Returns: boolean }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      app_role:
        | "supervisor"
        | "pcm"
        | "comprador"
        | "coordenador"
        | "gerente"
        | "admin"
      solicitacao_status:
        | "SOLICITADA"
        | "APROVADA_SUPERVISOR"
        | "CANCELADA_SUPERVISOR"
        | "EM_TRATAMENTO_PCM"
        | "AGUARDANDO_ORCAMENTO"
        | "ORCAMENTO_RECEBIDO"
        | "PEDIDO_EM_APROVACAO_COORD"
        | "PEDIDO_EM_APROVACAO_GERENTE"
        | "PEDIDO_EM_APROVACAO_DIRETORIA"
        | "PEDIDO_APROVADO_GESTAO"
        | "PEDIDO_REPROVADO_GESTAO"
        | "PEDIDO_COLOCADO"
        | "EM_TRANSITO"
        | "RECEBIDA_ALMOX"
        | "FINALIZADA"
        | "ENTREGUE_MECANICO"
        | "PENDENCIA_SOLICITANTE"
        | "REPROVADA"
        | "CANCELADA"
      tipo_frete: "LOCAL" | "TRANSPORTADORA"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
        "supervisor",
        "pcm",
        "comprador",
        "coordenador",
        "gerente",
        "admin",
      ],
      solicitacao_status: [
        "SOLICITADA",
        "APROVADA_SUPERVISOR",
        "CANCELADA_SUPERVISOR",
        "EM_TRATAMENTO_PCM",
        "AGUARDANDO_ORCAMENTO",
        "ORCAMENTO_RECEBIDO",
        "PEDIDO_EM_APROVACAO_COORD",
        "PEDIDO_EM_APROVACAO_GERENTE",
        "PEDIDO_EM_APROVACAO_DIRETORIA",
        "PEDIDO_APROVADO_GESTAO",
        "PEDIDO_REPROVADO_GESTAO",
        "PEDIDO_COLOCADO",
        "EM_TRANSITO",
        "RECEBIDA_ALMOX",
        "FINALIZADA",
        "ENTREGUE_MECANICO",
        "PENDENCIA_SOLICITANTE",
        "REPROVADA",
        "CANCELADA",
      ],
      tipo_frete: ["LOCAL", "TRANSPORTADORA"],
    },
  },
} as const
