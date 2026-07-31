import { useEffect, useState } from 'react'
import type { RoomSnapshot, SweepTransport } from '@/net/transport'

export function useRoom(transport: SweepTransport): RoomSnapshot {
  const [room, setRoom] = useState<RoomSnapshot>(() => transport.snapshot())
  useEffect(() => transport.subscribe(setRoom), [transport])
  return room
}
