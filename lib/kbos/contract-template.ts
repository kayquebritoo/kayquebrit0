// Modelo de contrato de prestação de serviços — interpolado com o briefing.
// ⚠️ MINUTA PADRÃO: revise com um(a) advogado(a) antes do uso oficial.
export type ContractData = {
  numero: string;
  data: string;
  contratanteNome: string;
  contratanteEmail: string;
  contratanteTel: string;
  objeto: string;
  categoria: string;
  prazo: string;
  valor: string;
  resumoBriefing: { pergunta: string; resposta: string }[];
};

export function buildContract(d: ContractData) {
  const L = (t: string) => t;
  return {
    titulo: "CONTRATO DE PRESTAÇÃO DE SERVIÇOS",
    numero: d.numero,
    intro: L(
      `Pelo presente instrumento, de um lado KAYQUE JONATHAN BRITO, tecnólogo criativo, produtor audiovisual e desenvolvedor, sediado em Belém/PA, doravante CONTRATADO, e de outro ${d.contratanteNome}, e-mail ${d.contratanteEmail}, telefone ${d.contratanteTel}, doravante CONTRATANTE, têm justo e contratado o seguinte:`
    ),
    clausulas: [
      {
        titulo: "CLÁUSULA 1ª — DO OBJETO",
        texto: L(
          `O CONTRATADO prestará ao CONTRATANTE serviços de ${d.categoria}, compreendendo: ${d.objeto}. O detalhamento técnico consta do briefing nº ${d.numero}, parte integrante deste contrato.`
        ),
      },
      {
        titulo: "CLÁUSULA 2ª — DO PRAZO",
        texto: L(
          `Os serviços serão executados com previsão de entrega em ${d.prazo}. Atrasos decorrentes de pendências do CONTRATANTE (materiais, aprovações, pagamentos) prorrogam o prazo na mesma medida.`
        ),
      },
      {
        titulo: "CLÁUSULA 3ª — DO VALOR E PAGAMENTO",
        texto: L(
          `O valor total é de ${d.valor}, pago 50% (cinquenta por cento) na assinatura como entrada e 50% na entrega final, via Pix, transferência ou gateway indicado pelo CONTRATADO. O início da execução fica condicionado à confirmação da entrada.`
        ),
      },
      {
        titulo: "CLÁUSULA 4ª — DAS OBRIGAÇÕES DO CONTRATANTE",
        texto: L(
          `Fornecer em tempo hábil textos, imagens, acessos e aprovações; indicar um responsável pelas decisões; efetuar os pagamentos nas datas avençadas.`
        ),
      },
      {
        titulo: "CLÁUSULA 5ª — DAS REVISÕES",
        texto: L(
          `Estão inclusas 2 (duas) rodadas de revisão por etapa. Alterações fora do escopo do briefing serão orçadas à parte.`
        ),
      },
      {
        titulo: "CLÁUSULA 6ª — DOS DIREITOS AUTORAIS E DE USO",
        texto: L(
          `Após a quitação integral, o CONTRATANTE recebe os direitos de uso do material final para os fins contratados. O CONTRATADO poderá exibir o trabalho em portfólio, salvo oposição expressa e escrita do CONTRATANTE. Arquivos-fonte/editáveis, quando solicitados, serão orçados à parte.`
        ),
      },
      {
        titulo: "CLÁUSULA 7ª — DA RESCISÃO",
        texto: L(
          `Qualquer parte pode rescindir com aviso de 7 (sete) dias. A entrada não é reembolsável e remunera reserva de agenda e custos iniciais; etapas concluídas serão cobradas proporcionalmente.`
        ),
      },
      {
        titulo: "CLÁUSULA 8ª — DO FORO",
        texto: L(
          `Fica eleito o foro da comarca de Belém/PA para dirimir quaisquer questões oriundas deste contrato.`
        ),
      },
    ],
    fecho: L(
      `E, por estarem justos e contratados, firmam o presente em 2 (duas) vias de igual teor. Belém/PA, ${d.data}.`
    ),
    assinaturas: ["CONTRATADO — Kayque Jonathan Brito", `CONTRATANTE — ${d.contratanteNome}`],
  };
}
