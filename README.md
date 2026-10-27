# Portal de Compras e Materiais

Este projeto nasceu de uma necessidade prática: organizar e facilitar o fluxo de compras e materiais utilizados na manutenção.

A proposta foi reunir em uma aplicação etapas que normalmente ficam distribuídas entre solicitações, planilhas, consultas de materiais, acompanhamento de pedidos e controles de estoque.

O projeto também representa meu processo de aprendizado na área de dados, automação e inteligência artificial. Minha formação profissional é voltada para processos e manutenção, e não para desenvolvimento de software. Por isso, utilizei ferramentas de IA e desenvolvimento assistido, principalmente o Lovable, para transformar as regras e necessidades que eu conhecia do processo em uma aplicação funcional.

## O que o sistema faz

Entre as funcionalidades desenvolvidas estão:

- criação e acompanhamento de solicitações de compra;
- consulta e organização de materiais;
- acompanhamento de pedidos;
- controles relacionados a estoque e consumo;
- importação de dados para apoiar as análises;
- painéis de acompanhamento do processo;
- análise do histórico de compras e consumo;
- identificação de materiais recorrentes e compras pontuais;
- análise das peças mais compradas, fornecedores e consumo por modelo de máquina;
- sugestão de materiais para estoque e sobressalentes;
- classificação de itens por prioridade;
- leitura de orçamentos em PDF ou imagem com auxílio de IA.

## Análise e sugestão de compras

Uma das partes que comecei a desenvolver no projeto foi o uso do próprio histórico de compras para ajudar a responder uma pergunta comum da manutenção:

**Quais materiais estamos comprando repetidamente e poderiam ser planejados antes da próxima necessidade?**

O sistema analisa o histórico disponível procurando recorrências, quantidade consumida, número de solicitações, utilização em diferentes máquinas e concentração de pedidos em determinados períodos.

A partir desses dados, ele gera sugestões de materiais que podem ser candidatos a estoque ou sobressalentes e os organiza por prioridade.

Para estimar uma quantidade de cobertura, o projeto utiliza uma abordagem estatística baseada em **distribuição de Poisson**, considerando a frequência observada das ocorrências, a quantidade típica utilizada, o prazo de entrega e um período adicional de segurança.

Essa análise ainda está em evolução.

Um dos principais desafios é a **qualidade dos dados de entrada**. Descrições diferentes para o mesmo material, cadastros pouco padronizados ou informações incompletas podem fazer com que itens iguais sejam interpretados como materiais diferentes.

Por isso, além de melhorar o modelo de análise, uma próxima etapa importante do projeto é evoluir a padronização e o tratamento desses dados antes dos cálculos.

Para mim, essa parte do projeto também tem sido uma forma prática de aprender que uma análise pode ter uma boa lógica estatística e, ainda assim, produzir resultados ruins quando a qualidade dos dados de origem não é adequada.

##Inteligência Artificial

Durante o uso do sistema percebi que cadastrar manualmente as peças presentes nos orçamentos era uma etapa repetitiva.

A partir disso, foi criada uma funcionalidade que permite enviar um orçamento em **PDF ou imagem** para que a IA identifique os itens e organize informações como código da peça, descrição, quantidade e unidade.

O resultado é transformado em dados estruturados e utilizado para preencher a solicitação.

A IA não conclui o processo sozinha. Os itens identificados são apresentados para que o usuário possa **revisar e corrigir as informações antes do envio**.

O fluxo funciona, de forma simplificada, assim:

**PDF ou imagem → leitura com IA → identificação dos itens → organização dos dados → preenchimento da solicitação → revisão do usuário**

Foi uma forma prática de aplicar IA em uma etapa em que ela realmente poderia reduzir trabalho manual.

## Tecnologias utilizadas

O projeto foi construído com apoio de ferramentas de desenvolvimento assistido por IA e utiliza tecnologias como:

- React
- TypeScript
- Supabase
- PostgreSQL
- Tailwind CSS
- Lovable
- IA generativa para interpretação de documentos
- análise estatística aplicada ao histórico de compras

## Meu papel no projeto

Não sou desenvolvedora de software e este projeto não pretende demonstrar que todo o código foi escrito manualmente por mim.

Meu trabalho esteve principalmente em:

- identificar o problema;
- entender o processo;
- definir regras de negócio;
- pensar quais informações seriam úteis para a tomada de decisão;
- desenhar os fluxos que o sistema deveria seguir;
- definir o comportamento esperado das funcionalidades;
- testar os resultados;
- identificar erros e necessidades de melhoria;
- utilizar IA
