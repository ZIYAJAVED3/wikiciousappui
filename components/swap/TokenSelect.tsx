import { ChevronDownIcon } from '@heroicons/react/20/solid'
import useMangoGroup from 'hooks/useMangoGroup'
import { Bank } from '@blockworks-foundation/mango-v4'
import { Dispatch, SetStateAction } from 'react'
import { formatTokenSymbol } from 'utils/tokens'
import TokenLogo from '@components/shared/TokenLogo'

type TokenSelectProps = {
  bank: Bank | undefined
  showTokenList: Dispatch<SetStateAction<'input' | 'output' | undefined>>
  type: 'input' | 'output'
}

const TokenSelect = ({ bank, showTokenList, type }: TokenSelectProps) => {
  const { group } = useMangoGroup()

  if (!group) return null

  return (
    <button
      onClick={() => showTokenList(type)}
      className="flex h-full w-full items-center rounded-lg rounded-r-none border border-r-0 border-th-input-border bg-th-input-bkg py-2 px-3 text-th-fgd-2 focus-visible:bg-th-bkg-2 md:hover:cursor-pointer md:hover:bg-th-bkg-2 md:hover:text-th-fgd-1"
    >
      <div className="mr-2.5 flex min-w-[24px] items-center">
        <TokenLogo bank={bank} />
      </div>
      <div className="flex w-full items-center justify-between">
        <div className="text-xl font-bold text-th-fgd-1">
          {formatTokenSymbol(bank!.name)}
        </div>
        <ChevronDownIcon className="h-6 w-6" />
      </div>
    </button>
  )
}

export default TokenSelect
