import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('soct_users')
      .select('id, full_name, role')
      .eq('role', 'ktv')
      .order('full_name')

    if (error) throw error

    return NextResponse.json({ data })
  } catch (error: any) {
    console.error('Error fetching users:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
