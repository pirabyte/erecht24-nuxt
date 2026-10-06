<script setup lang="ts">
const { data, error } = await useFetch<{ html: string }>('/api/legal/imprint')
</script>

<template>
  <main>
    <p v-if="error">Legal document unavailable</p>
    <div v-else v-html="data?.html" />
  </main>
</template>
