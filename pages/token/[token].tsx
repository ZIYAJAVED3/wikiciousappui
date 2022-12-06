import Change from '@components/shared/Change'
import DailyRange from '@components/shared/DailyRange'
import mangoStore, { TokenStatsItem } from '@store/mangoStore'
import type { NextPage } from 'next'
import { useTranslation } from 'next-i18next'
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'
import Image from 'next/legacy/image'
import { useRouter } from 'next/router'
import { useEffect, useMemo, useState } from 'react'
import FlipNumbers from 'react-flip-numbers'
import { formatDecimal, formatFixedDecimals } from 'utils/numbers'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import Button from '@components/shared/Button'
import {
  ArrowSmallUpIcon,
  ArrowTrendingUpIcon,
} from '@heroicons/react/20/solid'
import DepositModal from '@components/modals/DepositModal'
import BorrowModal from '@components/modals/BorrowModal'
import parse from 'html-react-parser'
import Link from 'next/link'
import SheenLoader from '@components/shared/SheenLoader'
import Tooltip from '@components/shared/Tooltip'
import ChartRangeButtons from '@components/shared/ChartRangeButtons'
import dynamic from 'next/dynamic'
import { LISTED_TOKENS } from 'utils/tokens'
import useMangoAccount from 'hooks/useMangoAccount'
import useMangoGroup from 'hooks/useMangoGroup'
import useJupiterMints from 'hooks/useJupiterMints'
import { useCoingecko } from 'hooks/useCoingecko'
import useLocalStorageState from 'hooks/useLocalStorageState'
import { ANIMATION_SETTINGS_KEY } from 'utils/constants'
import { INITIAL_ANIMATION_SETTINGS } from '@components/settings/AnimationSettings'
import TabButtons from '@components/shared/TabButtons'
const PriceChart = dynamic(() => import('@components/token/PriceChart'), {
  ssr: false,
})
const DetailedAreaChart = dynamic(
  () => import('@components/shared/DetailedAreaChart'),
  { ssr: false }
)
dayjs.extend(relativeTime)

export async function getStaticProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ['common', 'profile', 'token'])),
    },
  }
}

export const getStaticPaths = async () => {
  const paths = LISTED_TOKENS.map((token) => ({
    params: { token: token },
  }))

  return { paths, fallback: false }
}

const DEFAULT_COINGECKO_VALUES = {
  ath: 0,
  atl: 0,
  ath_change_percentage: 0,
  atl_change_percentage: 0,
  ath_date: 0,
  atl_date: 0,
  high_24h: 0,
  circulating_supply: 0,
  fully_diluted_valuation: 0,
  low_24h: 0,
  market_cap: 0,
  max_supply: 0,
  price_change_percentage_24h: 0,
  total_supply: 0,
  total_volume: 0,
}

const Token: NextPage = () => {
  const { t } = useTranslation(['common', 'token'])
  const actions = mangoStore((s) => s.actions)
  const tokenStats = mangoStore((s) => s.tokenStats.data)
  const loadingTokenStats = mangoStore((s) => s.tokenStats.loading)
  const [showFullDesc, setShowFullDesc] = useState(false)
  const [showDepositModal, setShowDepositModal] = useState(false)
  const [showBorrowModal, setShowBorrowModal] = useState(false)
  const [coingeckoData, setCoingeckoData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const { token } = router.query
  const { group } = useMangoGroup()
  const { mangoAccount } = useMangoAccount()
  const { mangoTokens } = useJupiterMints()
  const { isLoading: loadingPrices, data: coingeckoPrices } = useCoingecko()
  const [chartData, setChartData] = useState<{ prices: any[] } | null>(null)
  const [loadChartData, setLoadChartData] = useState(true)
  const [daysToShow, setDaysToShow] = useState<string>('1')
  const [activeDepositsTab, setActiveDepositsTab] = useState('token:deposits')
  const [activeBorrowsTab, setActiveBorrowsTab] = useState('token:borrows')
  const [animationSettings] = useLocalStorageState(
    ANIMATION_SETTINGS_KEY,
    INITIAL_ANIMATION_SETTINGS
  )

  useEffect(() => {
    if (group && !tokenStats.length) {
      actions.fetchTokenStats()
    }
  }, [group])

  const statsHistory = useMemo(() => {
    if (!tokenStats.length) return []
    return tokenStats.reduce((a: TokenStatsItem[], c: TokenStatsItem) => {
      if (c.symbol === token) {
        const copy = { ...c }
        copy.deposit_apr = copy.deposit_apr * 100
        copy.borrow_apr = copy.borrow_apr * 100
        a.push(copy)
      }
      return a.sort(
        (a, b) =>
          new Date(a.date_hour).getTime() - new Date(b.date_hour).getTime()
      )
    }, [])
  }, [tokenStats])

  const bank = useMemo(() => {
    if (group && token) {
      const bank = group.banksMapByName.get(token.toString())
      if (bank) {
        return bank[0]
      } else {
        setLoading(false)
      }
    }
  }, [group, token])

  const logoURI = useMemo(() => {
    if (bank && mangoTokens.length) {
      return mangoTokens.find((t) => t.address === bank.mint.toString())
        ?.logoURI
    }
  }, [bank, mangoTokens])

  const coingeckoId = useMemo(() => {
    if (bank && mangoTokens.length) {
      return mangoTokens.find((t) => t.address === bank.mint.toString())
        ?.extensions?.coingeckoId
    }
  }, [bank, mangoTokens])

  const serumMarkets = useMemo(() => {
    if (group) {
      return Array.from(group.serum3MarketsMapByExternal.values())
    }
    return []
  }, [group])

  const handleTrade = () => {
    const set = mangoStore.getState().set
    const market = serumMarkets.find(
      (m) => m.baseTokenIndex === bank?.tokenIndex
    )
    if (market) {
      set((state) => {
        state.selectedMarket.current = market
      })
      router.push('/trade')
    }
  }

  const fetchTokenInfo = async (tokenId: string) => {
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/${tokenId}?localization=false&tickers=false&developer_data=false&sparkline=false
      `
    )
    const data = await response.json()
    return data
  }

  useEffect(() => {
    const getCoingeckoData = async (id: string) => {
      const response = await fetchTokenInfo(id)
      setCoingeckoData(response)
      setLoading(false)
    }

    if (coingeckoId) {
      getCoingeckoData(coingeckoId)
    }
  }, [coingeckoId])

  const {
    ath,
    atl,
    ath_change_percentage,
    atl_change_percentage,
    ath_date,
    atl_date,
    high_24h,
    circulating_supply,
    fully_diluted_valuation,
    low_24h,
    market_cap,
    max_supply,
    price_change_percentage_24h,
    total_supply,
    total_volume,
  } = coingeckoData ? coingeckoData.market_data : DEFAULT_COINGECKO_VALUES

  const loadingChart = useMemo(() => {
    return daysToShow == '1' ? loadingPrices : loadChartData
  }, [loadChartData, loadingPrices])

  const coingeckoTokenPrices = useMemo(() => {
    if (daysToShow === '1' && coingeckoPrices.length && bank) {
      const tokenPriceData = coingeckoPrices.find(
        (asset) => asset.symbol === bank.name
      )

      if (tokenPriceData) {
        return tokenPriceData.prices
      }
    } else {
      if (chartData && !loadingChart) {
        return chartData.prices
      }
    }
    return []
  }, [coingeckoPrices, bank, daysToShow, chartData, loadingChart])

  const handleDaysToShow = async (days: string) => {
    if (days !== '1') {
      try {
        const response = await fetch(
          `https://api.coingecko.com/api/v3/coins/${coingeckoId}/market_chart?vs_currency=usd&days=${days}`
        )
        const data = await response.json()
        setLoadChartData(false)
        setChartData(data)
      } catch {
        setLoadChartData(false)
      }
    }
    setDaysToShow(days)
  }

  return (
    <div className="pb-20 md:pb-16">
      {bank ? (
        <>
          <div className="flex flex-col border-b border-th-bkg-3 px-6 py-5 md:flex-row md:items-center md:justify-between">
            <div className="mb-4 md:mb-1">
              <div className="mb-1.5 flex items-center space-x-2">
                <Image src={logoURI!} height="20" width="20" />
                {coingeckoData ? (
                  <h1 className="text-base font-normal">
                    {coingeckoData.name}{' '}
                    <span className="text-th-fgd-4">({bank.name})</span>
                  </h1>
                ) : (
                  <h1 className="text-base font-normal">{bank.name}</h1>
                )}
              </div>
              <div className="flex items-end space-x-3 text-5xl font-bold text-th-fgd-1">
                {animationSettings['number-scroll'] ? (
                  <FlipNumbers
                    height={48}
                    width={32}
                    play
                    delay={0.05}
                    duration={1}
                    numbers={formatFixedDecimals(bank.uiPrice, true)}
                  />
                ) : (
                  <span>{formatFixedDecimals(bank.uiPrice, true)}</span>
                )}
                {coingeckoData ? (
                  <Change change={price_change_percentage_24h} suffix="%" />
                ) : null}
              </div>
              {coingeckoData ? (
                <div className="mt-2">
                  <DailyRange
                    high={high_24h.usd}
                    low={low_24h.usd}
                    price={bank.uiPrice}
                  />
                </div>
              ) : null}
            </div>
            <div className="w-full rounded-md bg-th-bkg-2 p-4 md:w-[343px]">
              <div className="mb-4 flex justify-between">
                <p>
                  {bank.name} {t('balance')}:
                </p>
                <p className="font-mono text-th-fgd-2">
                  {mangoAccount
                    ? formatDecimal(
                        mangoAccount.getTokenBalanceUi(bank),
                        bank.mintDecimals
                      )
                    : 0}
                </p>
              </div>
              <div className="flex space-x-2">
                <Button
                  className="flex-1"
                  size="small"
                  disabled={!mangoAccount}
                  onClick={() => setShowDepositModal(true)}
                >
                  {t('deposit')}
                </Button>
                <Button
                  className="flex-1"
                  size="small"
                  secondary
                  disabled={!mangoAccount}
                  onClick={() => setShowBorrowModal(true)}
                >
                  {t('borrow')}
                </Button>
                <Button
                  className="flex-1"
                  size="small"
                  secondary
                  disabled={
                    !mangoAccount ||
                    !serumMarkets.find(
                      (m) => m.baseTokenIndex === bank?.tokenIndex
                    )
                  }
                  onClick={handleTrade}
                >
                  {t('trade')}
                </Button>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2">
            <div className="col-span-1 border-b border-th-bkg-3 md:border-r md:border-b-0">
              <div className="w-full">
                {statsHistory.length ? (
                  <>
                    <TabButtons
                      activeValue={activeDepositsTab}
                      onChange={(v) => setActiveDepositsTab(v)}
                      showBorders
                      values={[
                        ['token:deposits', 0],
                        ['token:deposit-rates', 0],
                      ]}
                    />
                    <div className="px-6 pt-5 pb-2">
                      {activeDepositsTab === 'token:deposits' ? (
                        <DetailedAreaChart
                          data={statsHistory}
                          daysToShow={'999'}
                          // domain={[0, 'dataMax']}
                          loading={loadingTokenStats}
                          small
                          tickFormat={(x) => x.toFixed(2)}
                          title={`${token} ${t('token:deposits')}`}
                          xKey="date_hour"
                          yKey={'total_deposits'}
                        />
                      ) : (
                        <DetailedAreaChart
                          data={statsHistory}
                          daysToShow={'999'}
                          // domain={[0, 'dataMax']}
                          loading={loadingTokenStats}
                          hideChange
                          small
                          suffix="%"
                          tickFormat={(x) => `${x.toFixed(2)}%`}
                          title={`${token} ${t('token:deposit-rates')} (APR)`}
                          xKey="date_hour"
                          yKey={'deposit_apr'}
                        />
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            </div>
            <div className="col-span-1">
              <div className="w-full">
                {statsHistory.length ? (
                  <>
                    <TabButtons
                      activeValue={activeBorrowsTab}
                      onChange={(v) => setActiveBorrowsTab(v)}
                      showBorders
                      values={[
                        ['token:borrows', 0],
                        ['token:borrow-rates', 0],
                      ]}
                    />
                    <div className="px-6 pt-5 pb-2">
                      {activeBorrowsTab === 'token:borrows' ? (
                        <DetailedAreaChart
                          data={statsHistory}
                          daysToShow={'999'}
                          // domain={[0, 'dataMax']}
                          loading={loadingTokenStats}
                          small
                          tickFormat={(x) => x.toFixed(2)}
                          title={`${token} ${t('token:borrows')}`}
                          xKey="date_hour"
                          yKey={'total_borrows'}
                        />
                      ) : (
                        <DetailedAreaChart
                          data={statsHistory}
                          daysToShow={'999'}
                          // domain={[0, 'dataMax']}
                          loading={loadingTokenStats}
                          small
                          hideChange
                          suffix="%"
                          tickFormat={(x) => `${x.toFixed(2)}%`}
                          title={`${token} ${t('token:borrow-rates')} (APR)`}
                          xKey="date_hour"
                          yKey={'borrow_apr'}
                        />
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center border-y border-th-bkg-3 px-6 py-4 text-center">
            <Tooltip
              content={'The percentage of deposits that have been lent out.'}
            >
              <p className="tooltip-underline mr-1">{t('utilization')}:</p>
            </Tooltip>
            <span className="font-mono text-th-fgd-2 no-underline">
              {bank.uiDeposits() > 0
                ? formatDecimal(
                    (bank.uiBorrows() / bank.uiDeposits()) * 100,
                    1,
                    { fixed: true }
                  )
                : '0.0'}
              %
            </span>
          </div>
          {coingeckoData ? (
            <>
              <div className="border-b border-th-bkg-3 py-4 px-6">
                <h2 className="mb-1 text-xl">About {bank.name}</h2>
                <div className="flex items-end">
                  <p
                    className={`${
                      showFullDesc ? 'h-full' : 'h-5'
                    } max-w-[720px] overflow-hidden`}
                  >
                    {parse(coingeckoData.description.en)}
                  </p>
                  <span
                    className="default-transition flex cursor-pointer items-end font-normal underline hover:text-th-fgd-2 md:hover:no-underline"
                    onClick={() => setShowFullDesc(!showFullDesc)}
                  >
                    {showFullDesc ? 'Less' : 'More'}
                    <ArrowSmallUpIcon
                      className={`h-5 w-5 ${
                        showFullDesc ? 'rotate-360' : 'rotate-180'
                      } default-transition`}
                    />
                  </span>
                </div>
              </div>
              {!loadingChart ? (
                coingeckoTokenPrices.length ? (
                  <>
                    <div className="mt-4 flex w-full items-center justify-between px-6">
                      <h2 className="text-base">{bank.name} Price Chart</h2>
                      <ChartRangeButtons
                        activeValue={daysToShow}
                        names={['24H', '7D', '30D']}
                        values={['1', '7', '30']}
                        onChange={(v) => handleDaysToShow(v)}
                      />
                    </div>
                    <PriceChart
                      daysToShow={parseInt(daysToShow)}
                      prices={coingeckoTokenPrices}
                    />
                  </>
                ) : bank?.name === 'USDC' || bank?.name === 'USDT' ? null : (
                  <div className="flex flex-col items-center p-6">
                    <ArrowTrendingUpIcon className="h-5 w-5 text-th-fgd-3" />
                    <p className="mb-0 text-th-fgd-4">
                      {t('token:chart-unavailable')}
                    </p>
                  </div>
                )
              ) : (
                <div className="h-10 w-[104px] animate-pulse rounded bg-th-bkg-3" />
              )}
              <div className="grid grid-cols-1 border-b border-th-bkg-3 md:grid-cols-2">
                <div className="col-span-1 border-y border-th-bkg-3 px-6 py-4 md:col-span-2">
                  <h2 className="text-base">{bank.name} Stats</h2>
                </div>
                <div className="col-span-1 border-r border-th-bkg-3 px-6 py-4">
                  <div className="flex justify-between pb-4">
                    <p>{t('token:market-cap')}</p>
                    <p className="font-mono text-th-fgd-2">
                      {formatFixedDecimals(market_cap.usd, true)}{' '}
                      <span className="text-th-fgd-4">
                        #{coingeckoData.market_cap_rank}
                      </span>
                    </p>
                  </div>
                  <div className="flex justify-between border-t border-th-bkg-3 py-4">
                    <p>{t('token:volume')}</p>
                    <p className="font-mono text-th-fgd-2">
                      {formatFixedDecimals(total_volume.usd, true)}
                    </p>
                  </div>
                  <div className="flex justify-between border-t border-th-bkg-3 py-4">
                    <p>{t('token:all-time-high')}</p>
                    <div className="flex flex-col items-end">
                      <div className="flex items-center font-mono text-th-fgd-2">
                        <span className="mr-2">
                          {formatFixedDecimals(ath.usd, true)}
                        </span>
                        <Change change={ath_change_percentage.usd} suffix="%" />
                      </div>
                      <p className="text-xs text-th-fgd-4">
                        {dayjs(ath_date.usd).format('MMM, D, YYYY')} (
                        {dayjs(ath_date.usd).fromNow()})
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-between border-b border-t border-th-bkg-3 py-4 md:border-b-0 md:pb-0">
                    <p>{t('token:all-time-low')}</p>
                    <div className="flex flex-col items-end">
                      <div className="flex items-center font-mono text-th-fgd-2">
                        <span className="mr-2">
                          {formatFixedDecimals(atl.usd, true)}
                        </span>
                        <Change change={atl_change_percentage.usd} suffix="%" />
                      </div>
                      <p className="text-xs text-th-fgd-4">
                        {dayjs(atl_date.usd).format('MMM, D, YYYY')} (
                        {dayjs(atl_date.usd).fromNow()})
                      </p>
                    </div>
                  </div>
                </div>
                <div className="col-span-1 px-6 pb-4 md:pt-4">
                  {fully_diluted_valuation.usd ? (
                    <div className="flex justify-between pb-4">
                      <p>{t('token:fdv')}</p>
                      <p className="font-mono text-th-fgd-2">
                        {formatFixedDecimals(fully_diluted_valuation.usd, true)}
                      </p>
                    </div>
                  ) : null}
                  <div
                    className={`flex justify-between ${
                      fully_diluted_valuation.usd
                        ? 'border-t border-th-bkg-3 py-4'
                        : 'pb-4'
                    }`}
                  >
                    <p>{t('token:circulating-supply')}</p>
                    <p className="font-mono text-th-fgd-2">
                      {formatFixedDecimals(circulating_supply)}
                    </p>
                  </div>
                  <div
                    className={`flex justify-between border-t border-th-bkg-3 ${
                      max_supply ? 'py-4' : 'border-b pt-4 md:pb-4'
                    }`}
                  >
                    <p>{t('token:total-supply')}</p>
                    <p className="font-mono text-th-fgd-2">
                      {formatFixedDecimals(total_supply)}
                    </p>
                  </div>
                  {max_supply ? (
                    <div className="flex justify-between border-t border-th-bkg-3 pt-4">
                      <p>{t('token:max-supply')}</p>
                      <p className="font-mono text-th-fgd-2">
                        {formatFixedDecimals(max_supply)}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center p-6">
              <span className="mb-0.5 text-2xl">🦎</span>
              <p>No CoinGecko data...</p>
            </div>
          )}
        </>
      ) : loading ? (
        <div className="space-y-3 px-6 py-4">
          <SheenLoader className="flex flex-1">
            <div className="h-32 w-full rounded-lg bg-th-bkg-2" />
          </SheenLoader>
          <SheenLoader className="flex flex-1">
            <div className="h-72 w-full rounded-lg bg-th-bkg-2" />
          </SheenLoader>
        </div>
      ) : (
        <div className="-mt-8 flex h-screen flex-col items-center justify-center">
          <p className="text-3xl">😔</p>
          <h2 className="mb-1">{t('token:token-not-found')}</h2>
          <p className="mb-2">
            {t('token:token-not-found-desc', { token: token })}
          </p>
          <Link href="/">
            <a>{t('token:go-to-account')}</a>
          </Link>
        </div>
      )}
      {showDepositModal ? (
        <DepositModal
          isOpen={showDepositModal}
          onClose={() => setShowDepositModal(false)}
          token={bank!.name}
        />
      ) : null}
      {showBorrowModal ? (
        <BorrowModal
          isOpen={showBorrowModal}
          onClose={() => setShowBorrowModal(false)}
          token={bank!.name}
        />
      ) : null}
    </div>
  )
}

export default Token
