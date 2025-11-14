import { createClient } from "@supabase/supabase-js"

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('Missing environment variable NEXT_PUBLIC_SUPABASE_URL')
}

if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error('Missing environment variable NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false
  }
})

// Crear y exportar el cliente de Supabase para el servidor (omite RLS)
export const supabaseAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null

// Función para verificar la conexión a Supabase
export async function testSupabaseConnection() {
  if (!supabase) {
    console.error("Supabase client not initialized. Check environment variables.")
    return {
      success: false,
      error:
        "Cliente de Supabase no inicializado. Verifica las variables de entorno NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    }
  }

  try {
    // Intentar una operación simple para verificar la conexión
    const { data, error } = await supabase.from("products").select("count", { count: "exact" })

    if (error) {
      console.error("Supabase connection test failed:", error.message)
      return { success: false, error: error.message }
    }

    console.log("Supabase connection successful:", data)
    return { success: true, data }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Error desconocido"
    console.error("Unexpected error testing Supabase connection:", errorMessage)
    return { success: false, error: errorMessage }
  }
}

// Función para verificar la conexión del cliente admin
export async function testAdminConnection() {
  if (!supabaseAdmin) {
    console.error("Supabase admin client not initialized. Check environment variables.")
    return {
      success: false,
      error: "Cliente admin de Supabase no inicializado. Verifica la variable de entorno SUPABASE_SERVICE_ROLE_KEY.",
    }
  }

  try {
    // Intentar una operación simple para verificar la conexión
    const { data, error } = await supabaseAdmin.from("products").select("count", { count: "exact" })

    if (error) {
      console.error("Supabase admin connection test failed:", error.message)
      return { success: false, error: error.message }
    }

    console.log("Supabase admin connection successful:", data)
    return { success: true, data }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Error desconocido"
    console.error("Unexpected error testing Supabase admin connection:", errorMessage)
    return { success: false, error: errorMessage }
  }
}
