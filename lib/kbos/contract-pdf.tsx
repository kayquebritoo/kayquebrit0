import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { buildContract, type ContractData } from "@/lib/kbos/contract-template";

const s = StyleSheet.create({
  page: { padding: 56, fontSize: 11, lineHeight: 1.6, color: "#14141c", fontFamily: "Helvetica" },
  title: { fontSize: 18, marginBottom: 4, textAlign: "center", fontFamily: "Helvetica-Bold" },
  numero: { fontSize: 10, textAlign: "center", color: "#555", marginBottom: 20 },
  intro: { marginBottom: 14, textAlign: "justify" },
  clausula: { fontFamily: "Helvetica-Bold", marginTop: 12, marginBottom: 4 },
  texto: { textAlign: "justify", marginBottom: 4 },
  resumoBox: { marginTop: 10, padding: 10, backgroundColor: "#f2f2f5" },
  resumoTitulo: { fontFamily: "Helvetica-Bold", marginBottom: 6 },
  item: { marginBottom: 3 },
  fecho: { marginTop: 16, textAlign: "justify" },
  ass: { marginTop: 40, flexDirection: "row", justifyContent: "space-between" },
  assBox: { width: "45%", borderTopWidth: 1, borderTopColor: "#14141c", paddingTop: 6, fontSize: 9, textAlign: "center" },
  rodape: { marginTop: 24, fontSize: 8, color: "#888", textAlign: "center" },
});

export default function ContractPdf({ data }: { data: ContractData }) {
  const c = buildContract(data);
  return (
    <Document title={`Contrato ${c.numero} — Kayque Brito`}>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>{c.titulo}</Text>
        <Text style={s.numero}>Briefing/Contrato nº {c.numero}</Text>
        <Text style={s.intro}>{c.intro}</Text>
        {c.clausulas.map((cl) => (
          <View key={cl.titulo} wrap={false}>
            <Text style={s.clausula}>{cl.titulo}</Text>
            <Text style={s.texto}>{cl.texto}</Text>
          </View>
        ))}
        <View style={s.resumoBox}>
          <Text style={s.resumoTitulo}>ANEXO — RESUMO DO BRIEFING</Text>
          {data.resumoBriefing.map((r, i) => (
            <Text key={i} style={s.item}>
              • {r.pergunta}: {r.resposta || "—"}
            </Text>
          ))}
        </View>
        <Text style={s.fecho}>{c.fecho}</Text>
        <View style={s.ass}>
          {c.assinaturas.map((a) => (
            <Text key={a} style={s.assBox}>{a}</Text>
          ))}
        </View>
        <Text style={s.rodape}>
          Documento gerado pelo Portal KBOS — minuta padrão, sujeita a revisão jurídica.
        </Text>
      </Page>
    </Document>
  );
}
