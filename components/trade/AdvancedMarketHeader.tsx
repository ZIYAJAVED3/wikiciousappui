import { Bank, PerpMarket, Serum3Market } from '@blockworks-foundation/mango-v4'
import { IconButton, LinkButton } from '@components/shared/Button'
import Change from '@components/shared/Change'
import { getOneDayPerpStats } from '@components/stats/PerpMarketsTable'
import { ChartBarIcon, InformationCircleIcon } from '@heroicons/react/20/solid'
import { Market } from '@project-serum/serum'
import mangoStore from '@store/mangoStore'
import { useQuery } from '@tanstack/react-query'
import useJupiterMints from 'hooks/useJupiterMints'
import useSelectedMarket from 'hooks/useSelectedMarket'
import { useTranslation } from 'next-i18next'
import { useEffect, useMemo, useState } from 'react'
import { Token } from 'types/jupiter'
import {
  formatCurrencyValue,
  getDecimalCount,
  numberCompacter,
} from 'utils/numbers'
import MarketSelectDropdown from './MarketSelectDropdown'
import PerpFundingRate from './PerpFundingRate'
import { BorshAccountsCoder } from '@coral-xyz/anchor'
import PerpMarketDetailsModal from '@components/modals/PerpMarketDetailsModal.tsx'

type ResponseType = {
  prices: [number, number][]
  market_caps: [number, number][]
  total_volumes: [number, number][]
}

const fetchTokenChange = async (
  mangoTokens: Token[],
  baseAddress: string
): Promise<ResponseType> => {
  let coingeckoId = mangoTokens.find((t) => t.address === baseAddress)
    ?.extensions?.coingeckoId

  if (baseAddress === '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh') {
    coingeckoId = 'bitcoin'
  }

  const response = await fetch(
    `https://api.coingecko.com/api/v3/coins/${coingeckoId}/market_chart?vs_currency=usd&days=1`
  )
  const data = await response.json()
  return data
}

const AdvancedMarketHeader = ({
  showChart,
  setShowChart,
}: {
  showChart?: boolean
  setShowChart?: (x: boolean) => void
}) => {
  const { t } = useTranslation(['common', 'trade'])
  const perpStats = mangoStore((s) => s.perpStats.data)
  const {
    serumOrPerpMarket,
    price: stalePrice,
    selectedMarket,
  } = useSelectedMarket()
  const selectedMarketName = mangoStore((s) => s.selectedMarket.name)
  const { mangoTokens } = useJupiterMints()
  const connection = mangoStore((s) => s.connection)
  const [price, setPrice] = useState(stalePrice)
  const [showMarketDetails, setShowMarketDetails] = useState(false)

  //subscribe to the market oracle account
  useEffect(() => {
    const client = mangoStore.getState().client
    const group = mangoStore.getState().group
    if (!group || !selectedMarket) return
    let marketOrBank: PerpMarket | Bank
    let decimals: number
    if (selectedMarket instanceof PerpMarket) {
      marketOrBank = selectedMarket
      decimals = selectedMarket.baseDecimals
    } else {
      const baseBank = group.getFirstBankByTokenIndex(
        selectedMarket.baseTokenIndex
      )
      marketOrBank = baseBank
      decimals = group.getMintDecimals(baseBank.mint)
    }

    const coder = new BorshAccountsCoder(client.program.idl)
    const subId = connection.onAccountChange(
      marketOrBank.oracle,
      async (info, _context) => {
        // selectedMarket = mangoStore.getState().selectedMarket.current
        // if (!(selectedMarket instanceof PerpMarket)) return
        const { price, uiPrice, lastUpdatedSlot } =
          await group.decodePriceFromOracleAi(
            coder,
            marketOrBank.oracle,
            info,
            decimals,
            client
          )
        marketOrBank._price = price
        marketOrBank._uiPrice = uiPrice
        setPrice(uiPrice)
        marketOrBank._oracleLastUpdatedSlot = lastUpdatedSlot
      },
      'processed'
    )
    return () => {
      if (typeof subId !== 'undefined') {
        connection.removeAccountChangeListener(subId)
      }
    }
  }, [connection, selectedMarket])

  useEffect(() => {
    if (serumOrPerpMarket instanceof PerpMarket) {
      const actions = mangoStore.getState().actions
      actions.fetchPerpStats()
    }
  }, [serumOrPerpMarket])

  const spotBaseAddress = useMemo(() => {
    const group = mangoStore.getState().group
    if (group && selectedMarket && selectedMarket instanceof Serum3Market) {
      return group
        .getFirstBankByTokenIndex(selectedMarket.baseTokenIndex)
        .mint.toString()
    }
  }, [selectedMarket])

  const spotChangeResponse = useQuery(
    ['coingecko-tokens', spotBaseAddress],
    () => fetchTokenChange(mangoTokens, spotBaseAddress!),
    {
      cacheTime: 1000 * 60 * 15,
      staleTime: 1000 * 60 * 10,
      retry: 3,
      enabled:
        !!spotBaseAddress &&
        serumOrPerpMarket instanceof Market &&
        mangoTokens.length > 0,
      refetchOnWindowFocus: false,
    }
  )

  const change = useMemo(() => {
    if (!price || !serumOrPerpMarket) return 0
    if (serumOrPerpMarket instanceof PerpMarket) {
      const changeData = getOneDayPerpStats(perpStats, selectedMarketName)

      return changeData.length
        ? ((price - changeData[0].price) / changeData[0].price) * 100
        : 0
    } else {
      if (!spotChangeResponse.data) return 0
      return (
        ((price - spotChangeResponse.data.prices?.[0][1]) /
          spotChangeResponse.data.prices?.[0][1]) *
        100
      )
    }
  }, [
    spotChangeResponse,
    price,
    serumOrPerpMarket,
    perpStats,
    selectedMarketName,
  ])

  return (
    <>
      <div className="flex flex-col bg-th-bkg-1 md:h-12 md:flex-row md:items-center">
        <div className="w-full px-4 md:w-auto md:px-6 md:py-0 lg:pb-0">
          <MarketSelectDropdown />
        </div>
        <div className="hide-scroll flex w-full items-center justify-between overflow-x-auto border-t border-th-bkg-3 py-2 px-5 md:border-t-0 md:py-0 md:px-0 md:pr-6">
          <div className="flex items-center">
            <div
              id="trade-step-two"
              className="flex-col whitespace-nowrap md:ml-6"
            >
              <div className="text-xs text-th-fgd-4">
                {t('trade:oracle-price')}
              </div>
              <div className="font-mono text-xs text-th-fgd-2">
                {price ? (
                  `${formatCurrencyValue(
                    price,
                    getDecimalCount(serumOrPerpMarket?.tickSize || 0.01)
                  )}`
                ) : (
                  <span className="text-th-fgd-4">–</span>
                )}
              </div>
            </div>
            <div className="ml-6 flex-col whitespace-nowrap">
              <div className="text-xs text-th-fgd-4">{t('rolling-change')}</div>
              <Change change={change} size="small" suffix="%" />
            </div>
            {serumOrPerpMarket instanceof PerpMarket ? (
              <>
                <div className="ml-6 flex-col whitespace-nowrap">
                  <div className="text-xs text-th-fgd-4">
                    {t('trade:funding-rate')}
                  </div>
                  <PerpFundingRate />
                </div>
                <div className="ml-6 flex-col whitespace-nowrap text-xs">
                  <div className="text-th-fgd-4">
                    {t('trade:open-interest')}
                  </div>
                  <span className="font-mono">
                    $
                    {numberCompacter.format(
                      serumOrPerpMarket.baseLotsToUi(
                        serumOrPerpMarket.openInterest
                      ) * serumOrPerpMarket.uiPrice
                    )}
                    <span className="mx-1">|</span>
                    {numberCompacter.format(
                      serumOrPerpMarket.baseLotsToUi(
                        serumOrPerpMarket.openInterest
                      )
                    )}{' '}
                    <span className="font-body text-th-fgd-3">
                      {serumOrPerpMarket.name.split('-')[0]}
                    </span>
                  </span>
                </div>
              </>
            ) : null}
          </div>
          <div className="ml-6 flex items-center space-x-4">
            {selectedMarket instanceof PerpMarket ? (
              <LinkButton
                className="flex items-center whitespace-nowrap text-th-fgd-3 no-underline md:hover:text-th-fgd-4"
                onClick={() => setShowMarketDetails(true)}
              >
                <InformationCircleIcon className="h-5 w-5 flex-shrink-0 md:mr-1.5 md:h-4 md:w-4" />
                <span className="hidden text-xs md:inline">
                  {t('trade:market-details', { market: '' })}
                </span>
              </LinkButton>
            ) : null}
            {setShowChart ? (
              <IconButton
                className={showChart ? 'text-th-active' : 'text-th-fgd-2'}
                onClick={() => setShowChart(!showChart)}
                hideBg
              >
                <ChartBarIcon className="h-5 w-5" />
              </IconButton>
            ) : null}
          </div>
        </div>
      </div>
      {showMarketDetails ? (
        <PerpMarketDetailsModal
          isOpen={showMarketDetails}
          onClose={() => setShowMarketDetails(false)}
        />
      ) : null}
    </>
  )
}

export default AdvancedMarketHeader
