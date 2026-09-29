import { APP_NAME } from '@households/shared'
import { darkTheme, lightTheme } from '@households/theme'
import { StatusBar } from 'expo-status-bar'
import { StyleSheet, Text, useColorScheme, View } from 'react-native'

// Placeholder until mobile development starts. It already pulls in the shared
// workspace packages, so Metro's monorepo resolution is exercised from day one.
export default function App() {
  const theme = useColorScheme() === 'dark' ? darkTheme : lightTheme

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Text style={[styles.title, { color: theme.colors.text }]}>{APP_NAME}</Text>
      <Text style={{ color: theme.colors.textMuted }}>Mobile app coming soon.</Text>
      <StatusBar style="auto" />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
})
