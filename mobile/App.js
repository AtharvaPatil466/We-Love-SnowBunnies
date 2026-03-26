import { useEffect, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { fetchAlerts, registerPushDevice, runPrediction } from "./src/api";

const demoTransaction = {
  transaction_id: "mobile_demo_01",
  sender_id: "user_mobile_01",
  receiver_id: "merchant_xyz",
  amount: 5000,
  timestamp: new Date().toISOString(),
  device_id: "phone_a1",
  product_type: "UPI",
  email_domain: "mail.xyz",
  location: "Proxy"
};

export default function App() {
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("home");
  const [alerts, setAlerts] = useState([]);
  const [pushStatus, setPushStatus] = useState("Preparing local alert inbox");

  useEffect(() => {
    refreshAlerts();
    registerForPushNotifications();
  }, []);

  async function refreshAlerts() {
    try {
      const result = await fetchAlerts(demoTransaction.sender_id);
      setAlerts(result.alerts);
    } catch {
      setAlerts([]);
    }
  }

  async function handleCheck() {
    setLoading(true);
    try {
      const result = await runPrediction(demoTransaction);
      setPrediction(result);
      await refreshAlerts();
      setActiveTab("alerts");
    } finally {
      setLoading(false);
    }
  }

  async function registerForPushNotifications() {
    try {
      const Notifications = await import("expo-notifications");
      const existingPermissions = await Notifications.getPermissionsAsync();
      let finalStatus = existingPermissions.status;
      if (finalStatus !== "granted") {
        const requested = await Notifications.requestPermissionsAsync();
        finalStatus = requested.status;
      }
      if (finalStatus !== "granted") {
        setPushStatus("Push permissions not granted");
        return;
      }

      const tokenResponse = await Notifications.getExpoPushTokenAsync();
      await registerPushDevice({
        user_id: demoTransaction.sender_id,
        expo_push_token: tokenResponse.data,
        platform: "android",
        device_label: "FraudSense demo handset"
      });
      setPushStatus("Expo push registration ready");
    } catch {
      setPushStatus("Push registration available on device builds");
    }
  }

  function formatTimestamp(value) {
    if (!value) {
      return "Just now";
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(parsed);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.eyebrow}>FraudSense Mobile</Text>
        <Text style={styles.title}>Real-time UPI fraud alerts for everyday users.</Text>
        <Text style={styles.subtitle}>
          Move between live scoring and your alert inbox to show the full customer experience.
        </Text>
        <Text style={styles.pushStatus}>{pushStatus}</Text>

        <View style={styles.tabRow}>
          <Pressable
            style={[styles.tabButton, activeTab === "home" && styles.tabButtonActive]}
            onPress={() => setActiveTab("home")}
          >
            <Text style={[styles.tabText, activeTab === "home" && styles.tabTextActive]}>Live check</Text>
          </Pressable>
          <Pressable
            style={[styles.tabButton, activeTab === "alerts" && styles.tabButtonActive]}
            onPress={() => setActiveTab("alerts")}
          >
            <Text style={[styles.tabText, activeTab === "alerts" && styles.tabTextActive]}>
              Alerts {alerts.length > 0 ? `(${alerts.length})` : ""}
            </Text>
          </Pressable>
        </View>

        {activeTab === "home" ? (
          <>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>Demo payment</Text>
              <Text style={styles.amount}>Rs 5,000 to merchant_xyz</Text>
              <Text style={styles.meta}>UPI | device phone_a1 | location Proxy</Text>
              <Text style={styles.meta}>Transaction time: {formatTimestamp(demoTransaction.timestamp)}</Text>
            </View>

            <Pressable style={styles.button} onPress={handleCheck}>
              <Text style={styles.buttonText}>{loading ? "Checking..." : "Check transaction risk"}</Text>
            </Pressable>

            {prediction && (
              <View style={styles.alertCard}>
                <Text style={styles.alertPill}>{prediction.risk_label.toUpperCase()} RISK</Text>
                <Text style={styles.alertScore}>
                  {Math.round(prediction.fraud_probability * 100)}% fraud probability
                </Text>
                <Text style={styles.alertText}>
                  {prediction.contributing_factors.join(" | ")}
                </Text>
                {prediction.linked_ring_ids.length > 0 && (
                  <Text style={styles.ringText}>
                    Linked rings: {prediction.linked_ring_ids.join(", ")}
                  </Text>
                )}
              </View>
            )}
          </>
        ) : (
          <ScrollView style={styles.alertsPane} contentContainerStyle={styles.alertsContent}>
            <Pressable style={styles.secondaryButton} onPress={refreshAlerts}>
              <Text style={styles.secondaryButtonText}>Refresh inbox</Text>
            </Pressable>
            {alerts.length > 0 ? (
              alerts.map((alert) => (
                <View key={alert.alert_id} style={styles.inboxCard}>
                  <Text style={styles.inboxPill}>{alert.risk_label.toUpperCase()} ALERT</Text>
                  <Text style={styles.inboxTitle}>
                    {Math.round(alert.fraud_probability * 100)}% fraud probability
                  </Text>
                  <Text style={styles.inboxMeta}>{alert.transaction_id}</Text>
                  <Text style={styles.inboxText}>{alert.message}</Text>
                  <Text style={styles.inboxTimestamp}>{formatTimestamp(alert.created_at)}</Text>
                  <Text style={styles.inboxMeta}>{alert.delivered ? `${alert.channel} delivered` : `${alert.channel} pending`}</Text>
                </View>
              ))
            ) : (
              <View style={styles.emptyInbox}>
                <Text style={styles.emptyInboxTitle}>No alerts yet</Text>
                <Text style={styles.emptyInboxText}>
                  Run the sample payment to generate a high-risk alert.
                </Text>
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#fff7ee"
  },
  container: {
    flex: 1,
    padding: 24,
    justifyContent: "center"
  },
  eyebrow: {
    textTransform: "uppercase",
    letterSpacing: 2,
    color: "#9a3412",
    marginBottom: 10
  },
  title: {
    fontSize: 34,
    fontWeight: "800",
    color: "#111827"
  },
  subtitle: {
    marginTop: 12,
    fontSize: 16,
    lineHeight: 24,
    color: "#4b5563"
  },
  pushStatus: {
    marginTop: 12,
    color: "#9a3412",
    fontWeight: "600"
  },
  tabRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
    marginBottom: 8
  },
  tabButton: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: "#fde7d7",
    paddingVertical: 12,
    alignItems: "center"
  },
  tabButtonActive: {
    backgroundColor: "#111827"
  },
  tabText: {
    color: "#9a3412",
    fontWeight: "700"
  },
  tabTextActive: {
    color: "#ffffff"
  },
  card: {
    marginTop: 28,
    padding: 20,
    borderRadius: 20,
    backgroundColor: "#111827"
  },
  cardLabel: {
    color: "#f4a261",
    marginBottom: 8
  },
  amount: {
    color: "#f9fafb",
    fontSize: 24,
    fontWeight: "700"
  },
  meta: {
    marginTop: 8,
    color: "#d1d5db"
  },
  button: {
    marginTop: 20,
    paddingVertical: 16,
    borderRadius: 999,
    backgroundColor: "#f95738",
    alignItems: "center"
  },
  buttonText: {
    fontWeight: "700",
    color: "#ffffff"
  },
  alertCard: {
    marginTop: 24,
    padding: 20,
    borderRadius: 20,
    backgroundColor: "#ffffff"
  },
  alertPill: {
    color: "#9a3412",
    fontWeight: "700",
    marginBottom: 8
  },
  alertScore: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827"
  },
  alertText: {
    marginTop: 10,
    color: "#4b5563",
    lineHeight: 22
  },
  ringText: {
    marginTop: 10,
    color: "#9a3412",
    fontWeight: "600"
  },
  alertsPane: {
    marginTop: 18
  },
  alertsContent: {
    paddingBottom: 24
  },
  secondaryButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#f4a261",
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 16
  },
  secondaryButtonText: {
    color: "#9a3412",
    fontWeight: "700"
  },
  inboxCard: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 18,
    marginBottom: 14
  },
  inboxPill: {
    color: "#9a3412",
    fontWeight: "800",
    marginBottom: 8
  },
  inboxTitle: {
    color: "#111827",
    fontWeight: "800",
    fontSize: 20
  },
  inboxMeta: {
    color: "#6b7280",
    marginTop: 6
  },
  inboxText: {
    color: "#374151",
    lineHeight: 22,
    marginTop: 10
  },
  inboxTimestamp: {
    color: "#9a3412",
    marginTop: 10,
    fontWeight: "600"
  },
  emptyInbox: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 20
  },
  emptyInboxTitle: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "800"
  },
  emptyInboxText: {
    color: "#4b5563",
    marginTop: 10,
    lineHeight: 22
  }
});
