# Portal de Compras com Inteligência Artificial

Projeto demonstrativo de uma aplicação para gestão do fluxo de compras e materiais, com uso de IA generativa para leitura de orçamentos em PDF e imagem e extração estruturada dos itens.

> Esta é uma versão de portfólio, sanitizada e sem dados operacionais, credenciais, identidade visual ou informações confidenciais da aplicação original.

## O problema

Processos de compras de manutenção costumam envolver informações espalhadas entre solicitações, ordens de serviço, orçamentos, materiais, fornecedores e acompanhamento de pedidos. Parte desse trabalho exige digitação e conferência manual de informações presentes em documentos recebidos em PDF ou imagem.

O projeto foi construído para transformar esse fluxo em uma aplicação digital e reduzir atividades manuais, mantendo a validação humana nas etapas críticas.

## Onde a IA entra

Uma das funcionalidades permite enviar um orçamento em **PDF ou imagem**. A aplicação encaminha o documento para um modelo de IA e solicita a extração estruturada dos itens relevantes, como:

- código da peça;
- descrição;
- quantidade;
- unidade.

O retorno é tratado em formato estruturado e utilizado para preencher a solicitação. Antes do envio definitivo, o usuário revisa as informações extraídas.

### Fluxo simplificado

**PDF ou imagem → IA → dados estruturados → validação → formulário preenchido → revisão humana → solicitação**

A revisão humana faz parte do desenho da solução: a resposta da IA auxilia o processo, mas não é tratada automaticamente como verdade definitiva.

## Funcionalidades presentes no projeto

Além da leitura de documentos com IA, a aplicação possui fluxos relacionados a:

- solicitações de materiais;
- acompanhamento de compras;
- estoque e consumo;
- importação de informações de sistemas corporativos;
- análise e sugestão de compras;
- custos por equipamento;
- serviços de terceiros;
- aprovações;
- acompanhamento de pedidos e fornecedores.

## Tecnologias

- React
- TypeScript
- Supabase
- IA generativa via API/Gateway
- saída estruturada em JSON
- Vite / TanStack
- Tailwind CSS

## Como o projeto foi construído

A aplicação nasceu de um problema operacional real. Meu papel foi mapear o processo, definir regras de negócio e funcionalidades, estruturar os fluxos, testar os resultados e evoluir a solução utilizando IA generativa e ferramentas de vibe coding como apoio ao desenvolvimento.

O objetivo do projeto de portfólio não é apresentar desenvolvimento tradicional feito integralmente do zero, e sim demonstrar a capacidade de transformar um problema de negócio em uma solução digital funcional, incluindo uma aplicação prática de IA no fluxo.

## Segurança e privacidade

Esta versão pública não contém a base operacional original. Credenciais e variáveis de ambiente não são versionadas. O arquivo `.env.example` contém apenas os nomes das variáveis necessárias para configuração.

## Status

Projeto em evolução, apresentado aqui em versão demonstrativa para portfólio.
