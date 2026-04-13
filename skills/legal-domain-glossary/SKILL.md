---
name: legal-domain-glossary
description: Brazilian legal terminology reference for prompts, UI copy, and AI output in Piccino and future legal-tech clients. Load whenever Claude is drafting, classifying, summarizing, or generating Portuguese-language legal content — peças processuais, prazos, prescrição, atos processuais, cálculos, trabalhista, civil, bancário. Trigger keywords — petição, contestação, recurso, prescrição, intimação, trabalhista, reclamante, execução, cumprimento de sentença, revisional, CLT, FGTS, SELIC, honorários, advogado, V. Exa., ex tunc, data venia.
---

# Brazilian Legal Domain Glossary

A **curated** vocabulary for the legal-tech systems Persimmon builds. Not a full dictionary — only terms the system actually produces, parses, or displays. Use this as the source of truth when drafting prompts in `src/lib/ai/prompts.ts`, labeling UI, classifying documents, or composing peças.

## How to use this skill

1. When drafting any Portuguese legal output (prompts, UI labels, generated briefs), **consult the relevant section below** before writing.
2. Match the register: formal, third-person, never `você`. Use `V. Exa.` for judges, `V. Sa.` for parties/counterparties in correspondence.
3. Latin terms follow the conventions at the bottom.
4. If a term is **not** in this glossary and the system needs it, add it here first, then use it. Drift between code and glossary causes bugs.

---

## Register Rules (apply globally)

| Context | Use | Never |
|---|---|---|
| Addressing a judge in a peça | `V. Exa.` / `Excelentíssimo Senhor Doutor Juiz` / `Meritíssimo` | `você`, `o senhor juiz` |
| Addressing opposing counsel / party in correspondence | `V. Sa.` / `Ilmo. Sr.` | `você` |
| Referring to a party in the body of a peça | `o Autor` / `a Ré` / `a parte Reclamante` (with capital) | first names, `ele/ela` in prose |
| Tense in peças | Third person, present/past — `requer`, `alegou`, `demonstrou` | first person (`eu peço`) |
| Abbreviations in UI labels (tight space) | `Proc.` (processo), `Ré` (ré), `Autor`, `Adv.` (advogado) | inventing new short forms — match what forums/tribunals use |
| Document title lines | ALL CAPS for peça names in a caption: `PETIÇÃO INICIAL`, `CONTESTAÇÃO` | title case |

**Cedillas, accents, tildes**: always correct. `ação`, `exceção`, `réu` (not `reu`), `parênteses`, `autarquia`. Never strip accents for "simplicity" — legal text looks unprofessional without them.

---

## Peças Processuais

Classification buckets the indexer must recognize and the brief generator must produce.

| Termo | Definição (1–2 lines) | Uso em prompts Claude |
|---|---|---|
| **Petição inicial** | Peça que abre o processo; o Autor narra fatos, fundamentos jurídicos e pedidos. | Classificação de documento: tipo inicial. Identificar partes, pedidos, valor da causa. |
| **Contestação** | Resposta do Réu à petição inicial; impugna fatos e fundamentos, pode trazer preliminares e matéria de defesa. | Classificação; extração de preliminares (incompetência, ilegitimidade, prescrição) separadas do mérito. |
| **Réplica** | Manifestação do Autor sobre a contestação; rebate preliminares e defesas. | Reconhecer como peça do Autor posterior à contestação. |
| **Tréplica** | Manifestação do Réu sobre a réplica. Comum em trabalhista; rara em cível. | Classificação; marcar como resposta à réplica. |
| **Memoriais** | Peça de encerramento antes da sentença; as partes resumem prova produzida e reforçam teses. | Extração de síntese probatória; insumo rico para brief generator. |
| **Sentença** | Decisão de mérito do juiz de 1º grau que extingue o processo. | Classificação; extrair dispositivo (procedente / improcedente / parcialmente procedente), valor da condenação, honorários. |
| **Acórdão** | Decisão colegiada de tribunal (2º grau ou superior) em recurso. | Classificação; extrair relator, turma, resultado do recurso. |
| **Despacho** | Ato de mero expediente ou decisão interlocutória simples do juiz. | Classificação; geralmente não gera tarefa — mas detectar intimação de prazo. |
| **Decisão interlocutória** | Decisão no curso do processo que resolve questão sem extinguir o feito (ex.: defere tutela, indefere prova). | Classificação; verificar cabimento de agravo de instrumento. |
| **Recurso** | Termo genérico para impugnação de decisão. Ver subtipos abaixo. | Nunca usar sozinho na classificação — sempre o subtipo. |
| **Apelação** | Recurso contra sentença de 1º grau. Prazo: 15 dias úteis (CPC) / 8 dias (CLT). | Classificação `APELACAO`. Extrair prazo, matéria recorrida. |
| **Agravo de instrumento** | Recurso contra decisão interlocutória que cause prejuízo imediato. Rol taxativo no CPC art. 1.015. | Classificação `AGRAVO_INSTRUMENTO`. Verificar tempestividade (15 dias úteis). |
| **Agravo interno** | Recurso contra decisão monocrática de relator em tribunal. Prazo 15 dias úteis. | Classificação `AGRAVO_INTERNO`. |
| **Embargos de declaração** | Recurso para sanar omissão, contradição, obscuridade ou erro material. Prazo 5 dias úteis. | Classificação `EMBARGOS_DECLARACAO`. Não é recurso de reforma — apontar isso no brief se cliente pede reforma. |
| **Recurso especial (REsp)** | Recurso ao STJ por violação de lei federal ou dissídio jurisprudencial (CF art. 105, III). | Classificação `RECURSO_ESPECIAL`. Requer prequestionamento. |
| **Recurso extraordinário (RE)** | Recurso ao STF por violação direta à CF (art. 102, III). | Classificação `RECURSO_EXTRAORDINARIO`. Requer repercussão geral. |
| **Contrarrazões** | Resposta ao recurso pela parte recorrida. | Classificação; associar ao recurso correspondente. |

**Prompt guidance**: quando o classificador retornar `"outros"` ou `"desconhecido"`, registrar o excerto da página e escalonar — nunca inventar tipo.

---

## Prazos e Prescrição

| Termo | Definição | Uso |
|---|---|---|
| **Prescrição** | Perda da pretensão pelo decurso do tempo (direito material). Extingue o crédito exigível. | Parâmetro de análise central. Distinguir de decadência. |
| **Decadência** | Perda do próprio direito pelo decurso do tempo (não da pretensão). Ex.: prazo decadencial para ação rescisória (2 anos). | Não confundir com prescrição — tratamento processual diferente. |
| **Preclusão** | Perda de faculdade processual por não exercício no prazo. Três tipos: temporal, lógica, consumativa. | Erro comum: chamar toda perda de prazo de prescrição. |
| **Prazo prescricional** | O intervalo legal em que a pretensão pode ser exercida. Trabalhista: 5 anos na vigência + 2 anos após término do contrato (CF art. 7º, XXIX). Civil: varia (CC art. 205–206). | Cálculo recorrente no sistema. |
| **Marco interruptivo** | Evento que zera a contagem do prazo (ex.: citação válida, protesto interruptivo, reconhecimento do débito). CC art. 202. | Identificar no histórico do processo; reinicia a contagem. |
| **Suspensão** | Paralisa o curso do prazo sem zerar o que já correu; retomada continua do ponto onde parou. | Diferente de interrupção. |
| **Termo inicial (dies a quo)** | Data em que o prazo começa a correr. Ex.: lesão, vencimento, ciência inequívoca. | Sempre explicitar no brief. |
| **Termo final (dies ad quem)** | Data em que o prazo termina. Atenção a prazo em dias corridos vs. úteis (CPC: úteis; CLT: corridos em geral). | Cálculo deve indicar qual regime. |
| **Tempestividade** | Característica do ato praticado dentro do prazo. | Verificação obrigatória em recursos. |
| **Intempestividade** | Ato fora do prazo → não conhecido. | Causa comum de não-conhecimento de recursos. |

---

## Atos Processuais

| Termo | Definição | Uso |
|---|---|---|
| **Citação** | Ato pelo qual o Réu é chamado a integrar o processo. Dela corre prazo de defesa. | Momento-chave. Ausência ou vício → nulidade absoluta. |
| **Intimação** | Comunicação de ato processual a parte, advogado, testemunha ou terceiro. Dela correm prazos recursais. | Ausência de intimação válida → nulidade, cerceamento, marco de prazo para recurso nunca corre. |
| **Notificação** | Termo amplo; no processo civil usado por vezes como sinônimo de intimação; fora dele, comunicação extrajudicial. | Desambiguar pelo contexto. |
| **Publicação** | Ato de tornar pública a decisão, em regra pelo DJE. Data da publicação = termo inicial para recurso (em regra, dia útil seguinte). | Cálculo de prazo recursal depende disso. |
| **DJE** | **Diário de Justiça Eletrônico**. Veículo oficial de publicação dos atos processuais. Cada tribunal tem o seu. | Extrair data de publicação para cálculo de prazo. |
| **Juntada** | Incorporação de documento aos autos. Data da juntada pode ser marco de prazo. | Útil para identificar ordem de peças. |
| **Conclusão** | Remessa dos autos ao juiz para decisão. | Sinal de decisão iminente. |
| **Vista** | Abertura de prazo para manifestação da parte. | Gera prazo; classificar como intimação. |
| **Carga** | Retirada física/eletrônica dos autos pelo advogado. | Em alguns tribunais, carga = intimação (CPC art. 272 §3º). |

---

## Partes e Representação

| Contexto | Ativo | Passivo |
|---|---|---|
| **Ação de conhecimento civil** | Autor | Réu |
| **Execução / cumprimento de sentença** | Exequente | Executado |
| **Procedimento administrativo / comum trabalhista (alguns)** | Requerente | Requerido |
| **Mandado de segurança** | Impetrante | Impetrado (autoridade coatora) |
| **Apelação** | Apelante | Apelado |
| **Agravo** | Agravante | Agravado |
| **Reclamação trabalhista** | Reclamante | Reclamada |
| **Embargos à execução** | Embargante | Embargado |

**Outras**:
- **Litisconsortes** — múltiplas partes no mesmo polo.
- **Terceiro interessado** — pode intervir (assistência, oposição, denunciação da lide).
- **Advogado** — representa a parte. Sempre precedido de `Dr.` / `Dra.` em correspondência formal; em peças, apenas o nome + OAB.
- **V. Exa.** — Vossa Excelência. Para juízes, desembargadores, ministros, promotores.
- **V. Sa.** — Vossa Senhoria. Para advogados, partes, serventuários em correspondência formal.

---

## Nulidades

| Termo | Definição | Uso |
|---|---|---|
| **Nulidade absoluta** | Vício insanável, de ordem pública, pode ser reconhecida de ofício e a qualquer tempo. Ex.: ausência de citação, incompetência absoluta. | Parâmetro de análise crítico. |
| **Nulidade relativa** | Vício que depende de arguição pela parte prejudicada no primeiro momento que falar nos autos, sob pena de preclusão. | Prazo para alegar é curto. |
| **Vício formal** | Descumprimento de forma prescrita em lei. Pode ser sanável. | Distinguir do vício substancial. |
| **Cerceamento de defesa** | Privação indevida de oportunidade de produzir prova ou se manifestar. Causa nulidade. | Parâmetro frequente; combinar com ausência de intimação. |
| **Ausência de intimação** | Falta de comunicação válida de ato processual. Impede fluência de prazo e pode anular atos subsequentes. | Parâmetro técnico — correlacionar publicações do DJE com peças das partes. |
| **Prejuízo (pas de nullité sans grief)** | Princípio: não há nulidade sem prejuízo demonstrado. | Ao arguir nulidade, sempre demonstrar prejuízo concreto. |

---

## Cálculos e Valores

| Termo | Definição | Uso |
|---|---|---|
| **Demonstrativo de débito** | Planilha anexa à inicial de execução ou cumprimento, detalhando principal, correção, juros, honorários. | Classificação de documento; extrair valores-base. |
| **Atualização monetária** | Correção do valor pela perda do poder de compra. Índice varia por matéria. | Verificar índice aplicado. |
| **Correção monetária** | Sinônimo de atualização monetária no uso corrente. | — |
| **Juros de mora** | Remuneração pelo atraso no pagamento. Civil: 1% ao mês (CC art. 406 + Súmula 648 STJ = SELIC desde ago/2024). Trabalhista: atualmente IPCA-E + juros TR na fase pré-judicial, SELIC na fase judicial (ADC 58/STF). | Cálculo sensível a data — o regime mudou em 2020 e 2024. |
| **SELIC** | Taxa básica do BC. Índice que **engloba correção + juros** (não se soma a outros). Aplicada como juros em execução fiscal e, pós-ADC 58, em trabalhista fase judicial. | Erro recorrente: somar SELIC com IPCA ou com TR — é duplicidade. |
| **TR** | Taxa Referencial. Historicamente usada como correção em FGTS e depósitos judiciais; declarada inconstitucional como índice de correção de débitos trabalhistas em 2020 (ADC 58). | Identificar em cálculos antigos para revisão. |
| **IPCA / IPCA-E** | Índice de Preços ao Consumidor Amplo (Especial). Correção em trabalhista fase pré-judicial pós-ADC 58. | Confirmar fase (pré vs. judicial). |
| **Honorários sucumbenciais** | Verba paga pela parte vencida ao advogado da parte vencedora. Civil: 10–20% (CPC art. 85). Trabalhista: 5–15% (CLT art. 791-A pós-Reforma 2017). | Extrair percentual e base de cálculo. |
| **Honorários contratuais** | Acordo entre cliente e advogado. Não se confundem com sucumbenciais. | Não aparecem no processo em regra. |
| **Valor da causa** | Valor atribuído ao processo pelo Autor. Base para custas e, em muitas hipóteses, para honorários. | Extrair da petição inicial. |

---

## Trabalhista

| Termo | Definição | Uso |
|---|---|---|
| **Reclamante / Reclamada** | Ativo / passivo na reclamação trabalhista. | Sempre esses termos, não Autor/Réu, em peças trabalhistas. |
| **CLT** | Consolidação das Leis do Trabalho (Decreto-Lei 5.452/1943). | Referência legislativa primária. |
| **Verbas rescisórias** | Parcelas devidas no término do contrato: saldo de salário, aviso prévio, 13º proporcional, férias proporcionais + 1/3, FGTS + multa 40% (quando cabível). | Checklist padrão em cálculos. |
| **FGTS** | Fundo de Garantia por Tempo de Serviço. Depósito mensal de 8% pelo empregador. | Verificar depósitos no extrato da Caixa. |
| **Multa de 40% do FGTS** | Devida na rescisão sem justa causa. | Confirmar modalidade de rescisão. |
| **Aviso prévio** | Indenizado (quando dispensado do cumprimento) ou trabalhado. Mínimo 30 dias + 3 por ano trabalhado, limitado a 90 (Lei 12.506/2011). | Cálculo frequente. |
| **Horas extras** | Trabalho além da jornada legal/contratual. Adicional mínimo 50% (CF art. 7º, XVI). | Base e reflexos (DSR, 13º, férias, FGTS). |
| **Adicional (noturno, periculosidade, insalubridade)** | Acréscimos por condições específicas. Percentuais: noturno 20%, periculosidade 30%, insalubridade 10/20/40% do salário mínimo. | Cumulação de periculosidade + insalubridade não é possível (CLT art. 193 §2º). |
| **DSR** | Descanso Semanal Remunerado. Reflexo sobre horas extras e outras parcelas variáveis. | Compor cálculo. |
| **Dano moral trabalhista** | Indenização por ofensa a direitos da personalidade no ambiente de trabalho. Tabelado pela Reforma 2017 (CLT art. 223-G), com modulação pelo STF (ADI 6050). | Identificar pedido e valor. |
| **Vínculo empregatício** | Relação caracterizada por pessoalidade, habitualidade, onerosidade, subordinação (CLT art. 3º). | Parâmetro de mérito em ações de reconhecimento de vínculo. |
| **Justa causa** | Rescisão por falta grave do empregado (CLT art. 482) ou do empregador (art. 483). | Afeta verbas devidas. |

---

## Civil / Bancário

| Termo | Definição | Uso |
|---|---|---|
| **Ação monitória** | Procedimento especial para cobrança com base em prova escrita sem eficácia de título executivo (CPC art. 700 ss.). | Classificar como procedimento especial. |
| **Execução de título extrajudicial** | Cobrança direta com base em título com eficácia executiva (CCB, duplicata, cheque, contrato com duas testemunhas, etc.). | Citação é para pagar em 3 dias, não para contestar. |
| **Cumprimento de sentença** | Fase executiva após sentença condenatória (CPC art. 523 ss.). Prazo para pagamento: 15 dias úteis, sob pena de multa 10% + honorários 10%. | Extrair marco inicial e cálculo de multa/honorários. |
| **Impugnação ao cumprimento de sentença** | Defesa do executado na fase de cumprimento. Matérias taxativas (CPC art. 525 §1º). | Não é contestação; rol é fechado. |
| **Embargos à execução** | Defesa do executado em execução de título extrajudicial. | Distinguir de impugnação ao cumprimento. |
| **Revisional de contrato** | Ação para revisar cláusulas contratuais, tipicamente bancárias. | Bancário — cerne do parâmetro "abusividade de juros". |
| **Capitalização de juros** | Incidência de juros sobre juros. Permitida em contratos bancários com previsão expressa e periodicidade definida pós-MP 1.963-17/2000 (hoje Lei 14.181/2021). | Verificar cláusula contratual e data. |
| **Anatocismo** | Sinônimo de capitalização de juros; historicamente usado em sentido pejorativo / proibido (Súmula 121 STF, superada parcialmente). | Usar com cuidado — hoje não é automaticamente vedado. |
| **Comissão de permanência** | Encargo de inadimplência. Súmula 472 STJ veda cumulação com correção, juros remuneratórios, moratórios ou multa. | Parâmetro recorrente em revisional. |
| **Tabela Price vs. SAC** | Sistemas de amortização. Tabela Price: prestações fixas; SAC: amortização constante. Discussão sobre capitalização na Price. | Específico de revisional imobiliária/consumo. |
| **CDC** | Código de Defesa do Consumidor (Lei 8.078/1990). Aplicável a contratos bancários (Súmula 297 STJ). | Fundamento comum em revisional. |

---

## Latinismos

Usados com moderação. Sempre em itálico quando possível; se o meio não suporta, manter grafia sem aspas.

| Termo | Uso | Exemplo |
|---|---|---|
| **ex tunc** | Efeitos retroativos. | "A nulidade opera efeitos *ex tunc*." |
| **ex nunc** | Efeitos a partir de agora (não retroativos). | Revogação de decisão normativa, em regra, *ex nunc*. |
| **data venia** | "Com a devida vênia". Para discordar respeitosamente. | "*Data venia*, não assiste razão à apelada." |
| **ad hoc** | Para este fim específico. | Nomeação de advogado *ad hoc*. |
| **ad argumentandum tantum** | Apenas para argumentar. | Afastar hipótese contrária. |
| **inaudita altera parte** | Sem ouvir a outra parte. | Tutela deferida *inaudita altera parte*. |
| **sub judice** | Sob apreciação judicial. | Matéria *sub judice*. |
| **erga omnes** | Contra todos; efeitos universais. | ADI com efeito *erga omnes*. |
| **inter partes** | Apenas entre as partes. | Sentença em regra faz coisa julgada *inter partes*. |
| **quantum debeatur** | Quanto é devido. | Liquidação do *quantum debeatur*. |
| **an debeatur** | Se é devido. | Mérito define o *an*; liquidação o *quantum*. |

**Anti-pattern**: encher peça de latinismo. Um ou dois por peça, quando ajudam. Nunca para mostrar erudição.

---

## Drafting Checklist (run before returning any Portuguese legal output)

- [ ] Register formal, terceira pessoa, sem `você`.
- [ ] Acentos e cedilhas corretos — nada de `reu`, `acao`, `excecao`.
- [ ] Termos de parte batem com o rito (Reclamante na trabalhista, Autor na cível).
- [ ] Prazo citado tem fundamento legal indicado (CPC/CLT + artigo).
- [ ] Se mencionou SELIC, não somou com IPCA ou TR no mesmo período.
- [ ] Subtipo de recurso explícito — nunca só "recurso".
- [ ] Citação de doutrina ou jurisprudência veio de RAG (não da memória paramétrica do modelo).
- [ ] Latinismos em itálico, parcimônia.
- [ ] `V. Exa.` para magistrado, `V. Sa.` para partes/advogados em correspondência.
