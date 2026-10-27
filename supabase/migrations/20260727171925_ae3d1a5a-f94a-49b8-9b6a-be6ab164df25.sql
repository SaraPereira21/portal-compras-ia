INSERT INTO public.configuracoes (chave, valor)
VALUES ('email_assinatura_html', '<p>Atenciosamente,</p>')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor;
